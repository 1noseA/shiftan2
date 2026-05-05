# DB設計書

## 1. 概要

### 1.1 方針

- DB：PostgreSQL（Supabase）
- アクセス制御：Supabase Row Level Security（RLS）でロール・店舗・部門単位に制御する
- 主キー：UUID（`gen_random_uuid()`）
- タイムスタンプ：`created_at` / `updated_at`（`timestamptz`、UTC）
- 削除：原則として論理削除（`is_active`）。マスタの誤登録のみ物理削除

### 1.2 ロール

| ロール | 説明 |
|---|---|
| office | 事務員。スタッフ管理・店舗共通設定（基本設定、勤務パターン、必要人数、自動生成条件）を担当 |
| manager | 部門マネジャー。自部門のシフト生成・編集・公開、人間関係制約、希望休確認を担当 |
| staff | シフト対象スタッフ。希望休入力・自部門シフト閲覧 |

### 1.3 認証連携

- Supabase Auth の `auth.users` を認証マスタとし、業務情報は `public.employees` に拡張する
- `employees.id = auth.users.id` で 1:1 連携する

### 1.4 マルチストア前提

現時点の運用は1店舗だが、将来の複数店舗対応に備え `stores` テーブルを設けて全データを店舗で分離可能にする。  
要件上のUI挙動は1店舗（暗黙のデフォルトストア）として扱う。

---

## 2. ER図

```mermaid
erDiagram
    stores ||--o{ departments : ""
    stores ||--o{ employees : ""
    stores ||--o{ work_patterns : ""
    stores ||--|| shift_settings : ""
    stores ||--|| auto_generation_settings : ""
    stores ||--o{ required_staff_counts : ""
    departments ||--o{ employees : ""
    employees ||--o{ day_off_requests : ""
    employees ||--o{ shift_assignments : ""
    employees ||--o{ relationship_constraints : "A"
    employees ||--o{ relationship_constraints : "B"
    work_patterns ||--o{ employees : "勤務パターン"
    work_patterns ||--o{ shift_assignments : ""
    work_patterns ||--o{ required_staff_counts : ""
    departments ||--o{ shifts : ""
    shifts ||--o{ shift_assignments : ""

    stores {
        uuid id PK
        text name
        timestamptz created_at
        timestamptz updated_at
    }
    departments {
        uuid id PK
        uuid store_id FK
        text name
        timestamptz created_at
        timestamptz updated_at
    }
    employees {
        uuid id PK_FK "auth.users.id"
        uuid store_id FK
        uuid department_id FK "office=NULL可"
        text email
        text last_name
        text first_name
        text role "office/manager/staff"
        text employment_type "正社員/契約社員/パート/アルバイト"
        int  max_workdays_per_month
        int  max_consecutive_workdays
        uuid work_pattern_id FK "勤務パターン"
        bool is_active
        timestamptz created_at
        timestamptz updated_at
    }
    work_patterns {
        uuid id PK
        uuid store_id FK
        text name
        time start_time
        time end_time
        int  break_minutes
        int  working_minutes
        bool is_active
        timestamptz created_at
        timestamptz updated_at
    }
    shift_settings {
        uuid id PK
        uuid store_id FK_UQ
        int  day_off_request_deadline_day
        int  day_off_max_per_month
        timestamptz updated_at
    }
    required_staff_counts {
        uuid id PK
        uuid store_id FK
        text day_type "weekday/holiday"
        uuid work_pattern_id FK
        int  required_count
    }
    relationship_constraints {
        uuid id PK
        uuid staff_a_id FK
        uuid staff_b_id FK
        text constraint_level "soft"
        text reason
        bool is_active
        timestamptz created_at
        timestamptz updated_at
    }
    auto_generation_settings {
        uuid id PK
        uuid store_id FK_UQ
        bool enable_day_off_hard
        bool enable_max_consecutive
        bool enable_one_shift_per_day
        bool enable_workable_pattern
        bool enable_relationship_soft
        bool enable_fairness
        timestamptz updated_at
    }
    day_off_requests {
        uuid id PK
        uuid staff_id FK
        date target_date
        timestamptz created_at
        timestamptz updated_at
    }
    shifts {
        uuid id PK
        date target_year_month "月初日"
        uuid department_id FK
        text status "draft/published"
        timestamptz updated_at
    }
    shift_assignments {
        uuid id PK
        uuid shift_id FK
        date target_date
        uuid work_pattern_id FK
        uuid staff_id FK
        text assignment_type "auto/manual"
        timestamptz created_at
        timestamptz updated_at
    }
```

---

## 3. テーブル定義

### 3.1 stores（店舗マスタ）

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK |
| name | text | NOT NULL | | 店舗名 |
| created_at | timestamptz | NOT NULL | `now()` | |
| updated_at | timestamptz | NOT NULL | `now()` | |

- UNIQUE: `name`

### 3.2 departments（部門マスタ）

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK |
| store_id | uuid | NOT NULL | | FK→`stores.id` |
| name | text | NOT NULL | | 部門名（例：青果、精肉、惣菜） |
| created_at | timestamptz | NOT NULL | `now()` | |
| updated_at | timestamptz | NOT NULL | `now()` | |

- UNIQUE: (`store_id`, `name`)

### 3.3 employees（社員 / スタッフ）

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | uuid | NOT NULL | | PK / FK→`auth.users.id` |
| store_id | uuid | NOT NULL | | FK→`stores.id` |
| department_id | uuid | NULL | | FK→`departments.id`。office のみNULL可 |
| email | text | NOT NULL | | ログイン用メール |
| last_name | text | NOT NULL | | 姓 |
| first_name | text | NOT NULL | | 名 |
| role | text | NOT NULL | `'staff'` | `'office'` / `'manager'` / `'staff'` |
| employment_type | text | NOT NULL | | `'正社員'` / `'契約社員'` / `'パート'` / `'アルバイト'` |
| max_workdays_per_month | int | NULL | | 月間最大勤務日数 |
| max_consecutive_workdays | int | NOT NULL | `4` | 最大連勤日数（デフォルト4日、スタッフごと個別設定） |
| work_pattern_id | uuid | NULL | | FK→`work_patterns.id`。スタッフごとに1つのみ。シフト対象外（office等）はNULL可 |
| is_active | bool | NOT NULL | `true` | 無効化フラグ |
| created_at | timestamptz | NOT NULL | `now()` | |
| updated_at | timestamptz | NOT NULL | `now()` | |

- UNIQUE: `email`
- CHECK: `role IN ('office','manager','staff')`
- CHECK: `employment_type IN ('正社員','契約社員','パート','アルバイト')`
- CHECK: `role = 'office' OR department_id IS NOT NULL` … manager / staff は部門必須
- 表示名は `last_name || ' ' || first_name`（半角スペース区切り）
- スタッフ1名につき勤務パターンは1つのみ。複数の時間帯に対応するスタッフを表現したい場合は、勤務パターンを別レコードとして登録する

### 3.4 work_patterns（勤務パターン）

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK |
| store_id | uuid | NOT NULL | | FK→`stores.id` |
| name | text | NOT NULL | | 例：朝アルバイト |
| start_time | time | NOT NULL | | |
| end_time | time | NOT NULL | | |
| break_minutes | int | NOT NULL | `0` | 休憩（分） |
| working_minutes | int | NOT NULL | | 実働（分） |
| is_active | bool | NOT NULL | `true` | |
| created_at | timestamptz | NOT NULL | `now()` | |
| updated_at | timestamptz | NOT NULL | `now()` | |

- UNIQUE: (`store_id`, `name`)

### 3.5 shift_settings（基本設定 / 店舗単位）

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK |
| store_id | uuid | NOT NULL | | FK→`stores.id` |
| day_off_request_deadline_day | int | NOT NULL | `10` | 前月の何日まで |
| day_off_max_per_month | int | NOT NULL | `3` | 月の希望休上限 |
| updated_at | timestamptz | NOT NULL | `now()` | |

- UNIQUE: `store_id` … 店舗ごとに1行
- 過去履歴は保持しない

### 3.6 required_staff_counts（必要人数 / 平日・休日）

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | uuid | NOT NULL | PK |
| store_id | uuid | NOT NULL | FK→`stores.id` |
| day_type | text | NOT NULL | `'weekday'` / `'holiday'` |
| work_pattern_id | uuid | NOT NULL | FK→`work_patterns.id` |
| required_count | int | NOT NULL | |

- UNIQUE: (`store_id`, `day_type`, `work_pattern_id`)
- CHECK: `day_type IN ('weekday','holiday')`
- 「平日／休日」の判定は生成エンジン側で土曜・日曜・祝日 = 休日として扱う

### 3.7 relationship_constraints（人間関係制約）

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | uuid | NOT NULL | PK |
| staff_a_id | uuid | NOT NULL | FK→`employees.id` |
| staff_b_id | uuid | NOT NULL | FK→`employees.id` |
| constraint_level | text | NOT NULL | 現状 `'soft'` のみ |
| reason | text | NULL | |
| is_active | bool | NOT NULL | `true` |
| created_at | timestamptz | NOT NULL | `now()` |
| updated_at | timestamptz | NOT NULL | `now()` |

- CHECK: `staff_a_id <> staff_b_id`
- CHECK: `constraint_level = 'soft'`
- UNIQUE INDEX: (`LEAST(staff_a_id, staff_b_id)`, `GREATEST(staff_a_id, staff_b_id)`) … ペア重複防止
- 同一店舗内のスタッフ同士であることはアプリ層で担保

### 3.8 auto_generation_settings（自動生成条件 / 店舗単位）

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK |
| store_id | uuid | NOT NULL | | FK→`stores.id` |
| enable_day_off_hard | bool | NOT NULL | `true` | 希望休をハード制約として扱う |
| enable_max_consecutive | bool | NOT NULL | `false` | 最大連勤日数 |
| enable_one_shift_per_day | bool | NOT NULL | `true` | 1日1シフト |
| enable_workable_pattern | bool | NOT NULL | `false` | 勤務パターン制約 |
| enable_relationship_soft | bool | NOT NULL | `false` | 人間関係soft制約 |
| enable_fairness | bool | NOT NULL | `false` | 公平性考慮 |
| updated_at | timestamptz | NOT NULL | `now()` | |

- UNIQUE: `store_id`

### 3.9 day_off_requests（希望休）

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | uuid | NOT NULL | PK |
| staff_id | uuid | NOT NULL | FK→`employees.id` |
| target_date | date | NOT NULL | 希望休日 |
| created_at | timestamptz | NOT NULL | `now()` |
| updated_at | timestamptz | NOT NULL | `now()` |

- UNIQUE: (`staff_id`, `target_date`)

### 3.10 shifts（シフトヘッダ）

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK |
| target_year_month | date | NOT NULL | | 対象月の月初日（YYYY-MM-01） |
| department_id | uuid | NOT NULL | | FK→`departments.id` |
| status | text | NOT NULL | `'draft'` | `'draft'` / `'published'` |
| updated_at | timestamptz | NOT NULL | `now()` | 楽観ロック用 |

- UNIQUE: (`target_year_month`, `department_id`)
- CHECK: `status IN ('draft','published')`
- CHECK: `EXTRACT(DAY FROM target_year_month) = 1`

### 3.11 shift_assignments（シフト割当）

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | uuid | NOT NULL | PK |
| shift_id | uuid | NOT NULL | FK→`shifts.id`（CASCADE） |
| target_date | date | NOT NULL | 勤務日 |
| work_pattern_id | uuid | NOT NULL | FK→`work_patterns.id` |
| staff_id | uuid | NOT NULL | FK→`employees.id` |
| assignment_type | text | NOT NULL | `'auto'` / `'manual'` |
| created_at | timestamptz | NOT NULL | `now()` |
| updated_at | timestamptz | NOT NULL | `now()` |

- UNIQUE: (`shift_id`, `target_date`, `staff_id`) … 1日1シフト制限（ハード制約）
- CHECK: `assignment_type IN ('auto','manual')`

---

## 4. RLSポリシー

すべてのテーブルで `ENABLE ROW LEVEL SECURITY`。  
共通ヘルパ関数を作成して再利用する。

```sql
create or replace function auth_role() returns text
language sql stable as $$
  select role from public.employees where id = auth.uid()
$$;

create or replace function auth_store_id() returns uuid
language sql stable as $$
  select store_id from public.employees where id = auth.uid()
$$;

create or replace function auth_department_id() returns uuid
language sql stable as $$
  select department_id from public.employees where id = auth.uid()
$$;
```

### 4.1 権限マトリクス

| 機能 / テーブル | office | manager | staff |
|---|---|---|---|
| stores（読） | 自店舗 | 自店舗 | 自店舗 |
| departments | 自店舗：CRUD | 自店舗：R | 自店舗：R |
| employees | 自店舗：CRUD | 自店舗：R / 自分のみU | 自部門：R / 自分のみU |
| work_patterns | 自店舗：CRUD | 自店舗：R | 自店舗：R |
| shift_settings | 自店舗：CRU | 自店舗：R | 自店舗：R |
| required_staff_counts | 自店舗：CRUD | 自店舗：R | 自店舗：R |
| auto_generation_settings | 自店舗：CRU | 自店舗：R | 自店舗：R |
| relationship_constraints | × | 自部門ペア：CRUD | × |
| day_off_requests | 自店舗：CRUD（締切後も可） | 自部門：R | 自分のみ：CRUD（締切前のみ） |
| shifts | 自店舗：R | 自部門：CRUD | 自部門 かつ `status='published'`：R |
| shift_assignments | 自店舗：R | 自部門 shift：CRUD | 自部門 かつ shift `published`：R |

- C/R/U/D は INSERT / SELECT / UPDATE / DELETE
- 締切判定はDBファンクション `is_day_off_editable(target_date)` を別途定義し、`day_off_requests` のWITH CHECK内で参照する
- staff の employees UPDATE は `role` / `store_id` / `department_id` / `employment_type` / `work_pattern_id` を変更不可とするカラムレベル制限が必要（トリガ or PostgREST のRPC経由で更新を限定）

---

## 5. インデックス

| テーブル | インデックス | 用途 |
|---|---|---|
| employees | `(store_id, department_id, is_active)` | 部門別スタッフ一覧 |
| employees | `(work_pattern_id)` | パターン別の対応スタッフ検索 |
| day_off_requests | `(staff_id, target_date)` | UNIQUE（既出） |
| day_off_requests | `(target_date)` | 日付別希望休一覧 |
| required_staff_counts | `(store_id, day_type, work_pattern_id)` | UNIQUE（既出） |
| shifts | `(target_year_month, department_id)` | UNIQUE（既出） |
| shift_assignments | `(shift_id, target_date)` | 日付別シフト表示 |
| shift_assignments | `(staff_id, target_date)` | スタッフ別シフト・連勤計算 |

---

## 6. 設計上の補足

### 6.1 マルチストア対応

現状の運用は1店舗のため `stores` には1行のみが入る。  
全データに `store_id` を持たせており、将来の複数店舗対応時は店舗追加とデータの`store_id`紐づけだけで分離できる構成。  
UI上の店舗切替は要件外（1店舗運用）。

### 6.2 楽観ロック

`shifts.updated_at` を競合検出に利用する。  
クライアントは編集前の `updated_at` をリクエストに含め、サーバー側で一致確認後に更新する。  
不一致の場合は `409 Conflict` を返し、画面で再読込を促す。

### 6.3 シフト再生成

同一 (`target_year_month`, `department_id`) で再生成する場合は、`shift_assignments` を一旦DELETEしてから再INSERTする。  
既存の手動編集は失われるため、UIで上書き確認ダイアログを出す。

### 6.4 祝日判定

祝日マスタテーブルは持たず、シフト生成エンジン側（Python）で祝日ライブラリを利用する。  
平日／休日の判定は生成エンジン内で完結し、DBには `weekday` / `holiday` の集計結果のみ保持する（`required_staff_counts`）。

### 6.5 過去データ

- 希望休、シフト、シフト割当は対象年月に紐づくため、過去月のレコードは残り続ける
- シフト条件（`shift_settings`、`required_staff_counts`、`work_patterns`、`relationship_constraints`、`auto_generation_settings`）は履歴を持たず、現在値のみ
- 物理削除はマスタの誤登録時のみ。運用では論理削除（`is_active=false`）を基本とする

### 6.6 今後の拡張に備える点

- 複数店舗運用：`stores` は既に存在するため、UIのストア切替実装で対応可能
- 人間関係hard制約：`relationship_constraints.constraint_level` のCHECK制約を緩める形で対応可能
- シフト変更依頼：`shift_change_requests` テーブルを別途追加する形で対応可能

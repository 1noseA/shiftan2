# DB設計書

## 1. 概要

### 1.1 方針

- DB：PostgreSQL（Supabase）
- アクセス制御：Supabase Row Level Security（RLS）でロール・部門単位に制御する
- 主キー：UUID（`gen_random_uuid()`）
- タイムスタンプ：`created_at` / `updated_at`（`timestamptz`、UTC）
- 削除：原則として論理削除（`is_active`）。履歴を持たないマスタは物理削除も可

### 1.2 ロール

| ロール | 説明 |
|---|---|
| admin | シフト管理者。全部門のスタッフ・シフトを管理可能 |
| staff | シフト対象スタッフ。自部門の公開済みシフトと、自分の希望休のみ操作可能 |

### 1.3 認証連携

- Supabase Auth の `auth.users` を認証マスタとし、業務情報は `public.profiles` に拡張する
- `profiles.id = auth.users.id` で 1:1 連携する

---

## 2. ER図

```mermaid
erDiagram
    departments ||--o{ profiles : "所属"
    profiles ||--o{ staff_work_patterns : "対応可能"
    work_patterns ||--o{ staff_work_patterns : ""
    profiles ||--o{ day_off_requests : "申請"
    profiles ||--o{ shift_assignments : "割当"
    work_patterns ||--o{ shift_assignments : ""
    work_patterns ||--o{ required_staff_counts_default : ""
    work_patterns ||--o{ required_staff_counts_daily : ""
    departments ||--o{ shifts : ""
    shifts ||--o{ shift_assignments : ""
    profiles ||--o{ relationship_constraints : "A"
    profiles ||--o{ relationship_constraints : "B"

    departments {
        uuid id PK
        text name
        timestamptz created_at
        timestamptz updated_at
    }
    profiles {
        uuid id PK_FK "auth.users.id"
        text email
        text full_name
        text display_name
        text role "admin / staff"
        uuid department_id FK
        text employment_type "正社員/契約社員/パート/アルバイト"
        int  max_workdays_per_month
        int  max_consecutive_workdays
        bool is_active
        timestamptz created_at
        timestamptz updated_at
    }
    work_patterns {
        uuid id PK
        text name
        time start_time
        time end_time
        int  break_minutes
        int  working_minutes
        bool is_active
        timestamptz created_at
        timestamptz updated_at
    }
    staff_work_patterns {
        uuid staff_id PK_FK
        uuid work_pattern_id PK_FK
    }
    shift_settings {
        int  id PK "固定値1"
        int  day_off_request_deadline_day
        int  day_off_max_per_month
        int  default_max_consecutive_workdays
        timestamptz updated_at
    }
    required_staff_counts_default {
        uuid id PK
        text day_type "weekday/holiday"
        uuid work_pattern_id FK
        int  required_count
    }
    required_staff_counts_daily {
        uuid id PK
        date target_date
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
        int  id PK "固定値1"
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

### 3.1 departments（部門マスタ）

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK |
| name | text | NOT NULL | | 部門名（例：青果、精肉、惣菜） |
| created_at | timestamptz | NOT NULL | `now()` | |
| updated_at | timestamptz | NOT NULL | `now()` | |

- UNIQUE: `name`

### 3.2 profiles（ユーザー / スタッフ）

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | uuid | NOT NULL | | PK / FK→`auth.users.id` |
| email | text | NOT NULL | | ログイン用メール |
| full_name | text | NOT NULL | | 氏名 |
| display_name | text | NOT NULL | | 表示名 |
| role | text | NOT NULL | `'staff'` | `'admin'` / `'staff'` |
| department_id | uuid | NULL | | FK→`departments.id`。adminもNULL可 |
| employment_type | text | NULL | | `'正社員'`/`'契約社員'`/`'パート'`/`'アルバイト'`。adminはNULL可 |
| max_workdays_per_month | int | NULL | | 月間最大勤務日数 |
| max_consecutive_workdays | int | NULL | | 個別最大連勤日数。NULL時は `shift_settings.default_max_consecutive_workdays` を使用 |
| is_active | bool | NOT NULL | `true` | 無効化フラグ |
| created_at | timestamptz | NOT NULL | `now()` | |
| updated_at | timestamptz | NOT NULL | `now()` | |

- UNIQUE: `email`
- CHECK: `role IN ('admin','staff')`
- CHECK: `employment_type IN ('正社員','契約社員','パート','アルバイト') OR employment_type IS NULL`

### 3.3 work_patterns（勤務パターン）

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK |
| name | text | NOT NULL | | 例：朝アルバイト |
| start_time | time | NOT NULL | | |
| end_time | time | NOT NULL | | |
| break_minutes | int | NOT NULL | `0` | 休憩（分） |
| working_minutes | int | NOT NULL | | 実働（分） |
| is_active | bool | NOT NULL | `true` | |
| created_at | timestamptz | NOT NULL | `now()` | |
| updated_at | timestamptz | NOT NULL | `now()` | |

- UNIQUE: `name`

### 3.4 staff_work_patterns（スタッフ × 勤務可能パターン）

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| staff_id | uuid | NOT NULL | FK→`profiles.id` |
| work_pattern_id | uuid | NOT NULL | FK→`work_patterns.id` |

- PK: (`staff_id`, `work_pattern_id`)

### 3.5 shift_settings（シフト基本設定 / シングルトン）

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | int | NOT NULL | `1` | 常に1行のみ |
| day_off_request_deadline_day | int | NOT NULL | `10` | 前月の何日まで |
| day_off_max_per_month | int | NOT NULL | `3` | 月の希望休上限 |
| default_max_consecutive_workdays | int | NOT NULL | `3` | デフォルト最大連勤日数 |
| updated_at | timestamptz | NOT NULL | `now()` | |

- CHECK: `id = 1`
- 過去履歴は保持しない（要件3.4.4）

### 3.6 required_staff_counts_default（必要人数デフォルト）

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | uuid | NOT NULL | PK |
| day_type | text | NOT NULL | `'weekday'` / `'holiday'` |
| work_pattern_id | uuid | NOT NULL | FK→`work_patterns.id` |
| required_count | int | NOT NULL | |

- UNIQUE: (`day_type`, `work_pattern_id`)
- CHECK: `day_type IN ('weekday','holiday')`

### 3.7 required_staff_counts_daily（必要人数 / 日付別）

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | uuid | NOT NULL | PK |
| target_date | date | NOT NULL | 対象日 |
| work_pattern_id | uuid | NOT NULL | FK→`work_patterns.id` |
| required_count | int | NOT NULL | |

- UNIQUE: (`target_date`, `work_pattern_id`)
- 対象年月分のレコードを生成・編集する

### 3.8 relationship_constraints（人間関係制約）

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | uuid | NOT NULL | PK |
| staff_a_id | uuid | NOT NULL | FK→`profiles.id` |
| staff_b_id | uuid | NOT NULL | FK→`profiles.id` |
| constraint_level | text | NOT NULL | 現状 `'soft'` のみ |
| reason | text | NULL | |
| is_active | bool | NOT NULL | `true` |
| created_at | timestamptz | NOT NULL | `now()` |
| updated_at | timestamptz | NOT NULL | `now()` |

- CHECK: `staff_a_id <> staff_b_id`
- CHECK: `constraint_level = 'soft'`
- UNIQUE: (`LEAST(staff_a_id, staff_b_id)`, `GREATEST(staff_a_id, staff_b_id)`)（重複防止のため関数インデックスで実装）

### 3.9 auto_generation_settings（自動生成条件 / シングルトン）

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | int | NOT NULL | `1` | 常に1行のみ |
| enable_day_off_hard | bool | NOT NULL | `true` | 希望休をハード制約として扱う |
| enable_max_consecutive | bool | NOT NULL | `false` | 最大連勤日数 |
| enable_one_shift_per_day | bool | NOT NULL | `true` | 1日1シフト |
| enable_workable_pattern | bool | NOT NULL | `false` | 勤務可能パターン制約 |
| enable_relationship_soft | bool | NOT NULL | `false` | 人間関係soft制約 |
| enable_fairness | bool | NOT NULL | `false` | 公平性考慮 |
| updated_at | timestamptz | NOT NULL | `now()` | |

- CHECK: `id = 1`

### 3.10 day_off_requests（希望休）

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | uuid | NOT NULL | PK |
| staff_id | uuid | NOT NULL | FK→`profiles.id` |
| target_date | date | NOT NULL | 希望休日 |
| created_at | timestamptz | NOT NULL | `now()` |
| updated_at | timestamptz | NOT NULL | `now()` |

- UNIQUE: (`staff_id`, `target_date`)

### 3.11 shifts（シフトヘッダ）

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

### 3.12 shift_assignments（シフト割当）

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | uuid | NOT NULL | PK |
| shift_id | uuid | NOT NULL | FK→`shifts.id`（CASCADE） |
| target_date | date | NOT NULL | 勤務日 |
| work_pattern_id | uuid | NOT NULL | FK→`work_patterns.id` |
| staff_id | uuid | NOT NULL | FK→`profiles.id` |
| assignment_type | text | NOT NULL | `'auto'` / `'manual'` |
| created_at | timestamptz | NOT NULL | `now()` |
| updated_at | timestamptz | NOT NULL | `now()` |

- UNIQUE: (`shift_id`, `target_date`, `staff_id`) … 1日1シフト制限（ハード制約）
- CHECK: `assignment_type IN ('auto','manual')`

---

## 4. RLSポリシー

すべてのテーブルで `ENABLE ROW LEVEL SECURITY` する。  
ヘルパ関数 `auth_role()`、`auth_department_id()` を作成して再利用する。

```sql
-- 例：現在ユーザーのロールを取得
create or replace function auth_role() returns text
language sql stable as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function auth_department_id() returns uuid
language sql stable as $$
  select department_id from public.profiles where id = auth.uid()
$$;
```

### 4.1 profiles

| 操作 | admin | staff |
|---|---|---|
| SELECT | 全行 | 自部門の `is_active=true` のみ（同部門メンバー閲覧用） + 自分の行 |
| INSERT | 可 | 不可 |
| UPDATE | 全行 | 自分の行のみ（role / department_id は変更不可） |
| DELETE | 不可（論理削除） | 不可 |

### 4.2 departments / work_patterns / shift_settings / required_staff_counts_default / required_staff_counts_daily / relationship_constraints / auto_generation_settings

| 操作 | admin | staff |
|---|---|---|
| SELECT | 可 | 可 |
| INSERT / UPDATE / DELETE | 可 | 不可 |

### 4.3 day_off_requests

| 操作 | admin | staff |
|---|---|---|
| SELECT | 全行 | 自分の行のみ |
| INSERT | 全スタッフ分可 | 自分の行のみ。かつ締切前のみ |
| UPDATE | 全行可 | 自分の行のみ。かつ締切前のみ |
| DELETE | 全行可 | 自分の行のみ。かつ締切前のみ |

- 締切判定はDBファンクションで実装（`shift_settings.day_off_request_deadline_day` を参照）

### 4.4 shifts

| 操作 | admin | staff |
|---|---|---|
| SELECT | 全行 | 自部門 かつ `status='published'` のみ |
| INSERT / UPDATE / DELETE | 可 | 不可 |

### 4.5 shift_assignments

| 操作 | admin | staff |
|---|---|---|
| SELECT | 全行 | 自部門の `shift.status='published'` のみ |
| INSERT / UPDATE / DELETE | 可 | 不可 |

---

## 5. インデックス

| テーブル | インデックス | 用途 |
|---|---|---|
| profiles | `(department_id, is_active)` | 自部門スタッフ一覧 |
| day_off_requests | `(staff_id, target_date)` | UNIQUE（既出） |
| day_off_requests | `(target_date)` | 日付別希望休一覧 |
| required_staff_counts_daily | `(target_date)` | UNIQUE（既出） |
| shifts | `(target_year_month, department_id)` | UNIQUE（既出） |
| shift_assignments | `(shift_id, target_date)` | 日付別シフト表示 |
| shift_assignments | `(staff_id, target_date)` | スタッフ別シフト表示・連勤計算 |

---

## 6. 設計上の補足

### 6.1 シングルトンテーブル

`shift_settings` と `auto_generation_settings` は常に1行とし、`id=1` のCHECK制約で担保する。  
新規環境では初期データとして1行INSERTする。

### 6.2 楽観ロック

`shifts.updated_at` を競合検出に利用する。  
クライアントは編集前の `updated_at` をリクエストに含め、サーバー側で一致確認後に更新する。  
不一致の場合は `409 Conflict` を返し、画面で再読込を促す。

### 6.3 シフト再生成

同一 (`target_year_month`, `department_id`) で再生成する場合は、`shifts.id` をキーに `shift_assignments` を一旦DELETEしてから再INSERTする。  
既存の手動編集は再生成で失われるため、UIで上書き確認ダイアログを出す。

### 6.4 祝日判定

祝日マスタテーブルは持たず、シフト生成エンジン側（Python）で祝日ライブラリを利用する。  
特別営業日は `required_staff_counts_daily` に対象日のレコードを作成して個別調整する。

### 6.5 過去データ

- 希望休、シフト、シフト割当は対象年月に紐づくため、過去月のレコードは残り続ける
- シフト条件（`shift_settings`、`required_staff_counts_default`、`work_patterns`、`relationship_constraints`、`auto_generation_settings`）は履歴を持たず、現在値のみ
- 物理削除はマスタの誤登録時のみ。運用では論理削除（`is_active=false`）を基本とする

### 6.6 今後の拡張に備える点

- 複数店舗対応：将来 `stores` テーブルを追加し、`departments.store_id` で紐づける拡張を想定
- 人間関係hard制約：`relationship_constraints.constraint_level` のCHECK制約を緩める形で対応可能
- シフト変更依頼：`shift_change_requests` テーブルを別途追加する形で対応可能

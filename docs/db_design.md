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
| office | 事務員。スタッフの登録・編集・無効化のみを担当。設定・希望休・シフトには関与しない |
| manager | 部門マネジャー。基本設定・勤務パターン・必要人数・自動生成条件・人間関係制約の管理、希望休一覧（自部門・締切後編集含む）、自部門のシフト生成・編集・公開を担当 |
| staff | シフト対象スタッフ。自分の希望休入力・自部門の公開シフト閲覧 |

#### office アカウントの運用ルール

- 店舗ごとに1アカウントのみ作成し、事務担当者が共有して使うオペレーション用アカウントとする
- `last_name` / `first_name` は人名である必要はなく、業務名でよい（例：「事務」「受付」）
- `work_pattern_id` は NULL（シフト割当の対象外）
- 事務担当者本人がシフト対象スタッフでもある場合、個人としては別途 staff ロールのアカウントを持つ。office アカウントとはDB上連携しない（同一人物識別は運用上で行う）

#### シフト候補者と人間関係制約の対象

- シフト割当（`shift_assignments.staff_id`）の候補者は `work_pattern_id IS NOT NULL` のスタッフのみ。office アカウントは自動的に除外される
- 人間関係制約（`relationship_constraints.staff_a_id` / `staff_b_id`）も `work_pattern_id IS NOT NULL` のスタッフに限定する（アプリ層またはトリガで検証）

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
    stores ||--o{ employees : ""
    stores ||--o{ required_staff_counts : ""
    stores ||--o{ auto_generation_settings : ""
    stores ||--o{ shifts : ""
    departments ||--o{ employees : ""
    departments ||--o{ required_staff_counts : ""
    departments ||--o{ auto_generation_settings : ""
    departments ||--o{ shifts : ""
    employees ||--o{ day_off_requests : ""
    employees ||--o{ shift_assignments : ""
    stores ||--o{ relationship_constraints : ""
    departments ||--o{ relationship_constraints : ""
    employees ||--o{ relationship_constraints : "A"
    employees ||--o{ relationship_constraints : "B"
    work_patterns ||--o{ employees : "勤務パターン"
    work_patterns ||--o{ shift_assignments : ""
    work_patterns ||--o{ required_staff_counts : ""
    shifts ||--o{ shift_assignments : ""

    stores {
        uuid id PK
        text name
        timestamptz created_at
        timestamptz updated_at
    }
    departments {
        uuid id PK
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
        int  id PK "固定値1"
        int  day_off_request_deadline_day
        int  day_off_max_per_month
        timestamptz created_at
        timestamptz updated_at
    }
    required_staff_counts {
        uuid id PK
        uuid store_id FK
        uuid department_id FK
        text day_type "weekday/holiday"
        uuid work_pattern_id FK
        int  required_count
        timestamptz created_at
        timestamptz updated_at
    }
    relationship_constraints {
        uuid id PK
        uuid store_id FK
        uuid department_id FK
        uuid staff_a_id FK
        uuid staff_b_id FK
        text reason
        bool is_active
        timestamptz created_at
        timestamptz updated_at
    }
    auto_generation_settings {
        uuid id PK
        uuid store_id FK
        uuid department_id FK
        bool enable_day_off_hard
        bool enable_max_consecutive
        bool enable_one_shift_per_day
        bool enable_workable_pattern
        bool enable_relationship_soft
        bool enable_fairness
        timestamptz created_at
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
        uuid store_id FK
        uuid department_id FK
        text status "draft/published"
        timestamptz created_at
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

### 3.2 departments（部門マスタ / 全店共通）

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK |
| name | text | NOT NULL | | 部門名（例：青果、精肉、惣菜） |
| created_at | timestamptz | NOT NULL | `now()` | |
| updated_at | timestamptz | NOT NULL | `now()` | |

- UNIQUE: `name`
- 全店舗で共通の部門マスタ。店舗ごとに使う部門が異なる場合も、マスタ自体は共通とする

### 3.3 employees（社員 / スタッフ）

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | uuid | NOT NULL | | PK / FK→`auth.users.id` |
| store_id | uuid | NOT NULL | | FK→`stores.id` |
| department_id | uuid | NULL | | FK→`departments.id`。office のみNULL可 |
| email | text | NOT NULL | | ログイン用メール。`auth.users.email` を正とし、トリガで同期する（6.7参照） |
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

### 3.4 work_patterns（勤務パターン / 全店共通）

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
- 全店舗で共通の勤務パターンマスタ。店舗固有の時間帯が必要になった場合のみ追加する

### 3.5 shift_settings（基本設定 / 全店共通シングルトン）

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | int | NOT NULL | `1` | 常に1行のみ |
| day_off_request_deadline_day | int | NOT NULL | `10` | 前月の何日まで |
| day_off_max_per_month | int | NOT NULL | `3` | 月の希望休上限 |
| created_at | timestamptz | NOT NULL | `now()` | |
| updated_at | timestamptz | NOT NULL | `now()` | |

- CHECK: `id = 1` … シングルトン
- 全店舗で同一の運用ルール。過去履歴は保持しない

### 3.6 required_staff_counts（必要人数 / 店舗 × 部門）

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | uuid | NOT NULL | PK |
| store_id | uuid | NOT NULL | FK→`stores.id` |
| department_id | uuid | NOT NULL | FK→`departments.id` |
| day_type | text | NOT NULL | `'weekday'` / `'holiday'` |
| work_pattern_id | uuid | NOT NULL | FK→`work_patterns.id` |
| required_count | int | NOT NULL | |
| created_at | timestamptz | NOT NULL | `now()` |
| updated_at | timestamptz | NOT NULL | `now()` |

- UNIQUE: (`store_id`, `department_id`, `day_type`, `work_pattern_id`)
- CHECK: `day_type IN ('weekday','holiday')`
- 「平日／休日」の判定は生成エンジン側で土曜・日曜・祝日 = 休日として扱う
- 店舗×部門ごとに必要人数が異なる前提

### 3.7 relationship_constraints（人間関係制約 / 店舗 × 部門）

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | uuid | NOT NULL | PK |
| store_id | uuid | NOT NULL | FK→`stores.id`。staff_a / staff_b の所属店舗と一致させる |
| department_id | uuid | NOT NULL | FK→`departments.id`。staff_a / staff_b の所属部門と一致させる |
| staff_a_id | uuid | NOT NULL | FK→`employees.id` |
| staff_b_id | uuid | NOT NULL | FK→`employees.id` |
| reason | text | NULL | |
| is_active | bool | NOT NULL | `true` |
| created_at | timestamptz | NOT NULL | `now()` |
| updated_at | timestamptz | NOT NULL | `now()` |

- CHECK: `staff_a_id <> staff_b_id`
- UNIQUE INDEX: (`LEAST(staff_a_id, staff_b_id)`, `GREATEST(staff_a_id, staff_b_id)`) … ペア重複防止
- 全レコードを soft 制約として扱う（hard 制約は対象外）
- 登録時は `store_id` / `department_id` が両スタッフの所属と一致することをトリガまたはアプリ層で担保する
- スタッフが異動した場合、関連する制約は `is_active = false` に切り替えて見直しを促す（6.6 参照）

### 3.8 auto_generation_settings（自動生成条件 / 店舗 × 部門）

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK |
| store_id | uuid | NOT NULL | | FK→`stores.id` |
| department_id | uuid | NOT NULL | | FK→`departments.id` |
| enable_day_off_hard | bool | NOT NULL | `true` | 希望休をハード制約として扱う |
| enable_max_consecutive | bool | NOT NULL | `false` | 最大連勤日数 |
| enable_one_shift_per_day | bool | NOT NULL | `true` | 1日1シフト |
| enable_workable_pattern | bool | NOT NULL | `false` | 勤務パターン制約 |
| enable_relationship_soft | bool | NOT NULL | `false` | 人間関係soft制約 |
| enable_fairness | bool | NOT NULL | `false` | 公平性考慮 |
| created_at | timestamptz | NOT NULL | `now()` | |
| updated_at | timestamptz | NOT NULL | `now()` | |

- UNIQUE: (`store_id`, `department_id`)
- 部門ごとに有効化する制約を切り替えられる前提

### 3.9 day_off_requests（希望休）

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | uuid | NOT NULL | PK |
| staff_id | uuid | NOT NULL | FK→`employees.id` |
| target_date | date | NOT NULL | 希望休日 |
| created_at | timestamptz | NOT NULL | `now()` |
| updated_at | timestamptz | NOT NULL | `now()` |

- UNIQUE: (`staff_id`, `target_date`)

### 3.10 shifts（シフトヘッダ / 店舗 × 部門 × 対象年月）

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK |
| target_year_month | date | NOT NULL | | 対象月の月初日（YYYY-MM-01） |
| store_id | uuid | NOT NULL | | FK→`stores.id` |
| department_id | uuid | NOT NULL | | FK→`departments.id` |
| status | text | NOT NULL | `'draft'` | `'draft'` / `'published'` |
| created_at | timestamptz | NOT NULL | `now()` | |
| updated_at | timestamptz | NOT NULL | `now()` | 楽観ロック用 |

- UNIQUE: (`target_year_month`, `store_id`, `department_id`)
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
| stores | R | R | R |
| departments（全店共通） | R | R | R |
| employees | 自店舗：CRUD | 自店舗：R | 自部門：R |
| work_patterns（全店共通） | R | CRUD | R |
| shift_settings（全店共通） | × | RU | R |
| required_staff_counts | × | 自店舗自部門：CRUD | 自店舗：R |
| auto_generation_settings | × | 自店舗自部門：CRUD | 自店舗：R |
| relationship_constraints | × | 自店舗自部門：CRUD | × |
| day_off_requests | × | 自部門：CRUD（締切後も可） | 自分のみ：CRUD（締切前のみ） |
| shifts | × | 自店舗自部門：CRUD | 自店舗自部門 かつ `status='published'`：R |
| shift_assignments | × | 自店舗自部門 shift：CRUD | 自店舗自部門 かつ shift `published`：R |

- C/R/U/D は INSERT / SELECT / UPDATE / DELETE
- 締切判定はDBファンクション `is_day_off_editable(target_date)` を別途定義し、`day_off_requests` のWITH CHECK内で参照する
- `employees` の UPDATE は office のみに限定する。manager / staff からのプロフィール直接編集は提供しない（パスワード・メールアドレス変更は Supabase Auth API 経由で行い、変更結果は `auth.users` 同期トリガを介して `employees` に反映される。6.7参照）

---

## 5. インデックス

| テーブル | インデックス | 用途 |
|---|---|---|
| employees | `(store_id, department_id, is_active)` | 部門別スタッフ一覧 |
| employees | `(work_pattern_id)` | パターン別の対応スタッフ検索 |
| employees | UNIQUE `(store_id) WHERE role = 'office' AND is_active = true` | 1店舗 office は有効1アカウントまで（無効化済み履歴は重複可） |
| day_off_requests | `(staff_id, target_date)` | UNIQUE（既出） |
| day_off_requests | `(target_date)` | 日付別希望休一覧 |
| required_staff_counts | `(store_id, department_id, day_type, work_pattern_id)` | UNIQUE（既出） |
| auto_generation_settings | `(store_id, department_id)` | UNIQUE（既出） |
| relationship_constraints | `(store_id, department_id, is_active)` | 自部門の有効な制約一覧 |
| shifts | `(target_year_month, store_id, department_id)` | UNIQUE（既出） |
| shift_assignments | `(shift_id, target_date)` | 日付別シフト表示 |
| shift_assignments | `(staff_id, target_date)` | スタッフ別シフト・連勤計算 |

---

## 6. 設計上の補足

### 6.1 マルチストア対応

現状の運用は1店舗のため `stores` には1行のみが入る。  
データのスコープは以下の3層に分かれる：

- **全店共通**：`departments` / `work_patterns` / `shift_settings`
- **店舗単位**：`employees`
- **店舗 × 部門単位**：`required_staff_counts` / `auto_generation_settings` / `shifts`（および配下の `shift_assignments`）

将来の複数店舗対応時は、店舗追加と店舗単位以下のデータの `store_id` 紐づけだけで分離できる構成。  
UI上の店舗切替は要件外（1店舗運用）。

### 6.2 楽観ロック

`shifts.updated_at` を競合検出に利用する。  
クライアントは編集前の `updated_at` をリクエストに含め、サーバー側で一致確認後に更新する。  
不一致の場合は `409 Conflict` を返し、画面で再読込を促す。

### 6.3 シフト再生成

同一 (`target_year_month`, `store_id`, `department_id`) で再生成する場合は、`shift_assignments` を一旦DELETEしてから再INSERTする。  
既存の手動編集は失われるため、UIで上書き確認ダイアログを出す。

### 6.4 祝日判定

祝日マスタテーブルは持たず、シフト生成エンジン側（Python）で祝日ライブラリを利用する。  
平日／休日の判定は生成エンジン内で完結し、DBには `weekday` / `holiday` の集計結果のみ保持する（`required_staff_counts`）。

### 6.5 過去データ

- 希望休、シフト、シフト割当は対象年月に紐づくため、過去月のレコードは残り続ける
- シフト条件（`shift_settings`、`required_staff_counts`、`work_patterns`、`relationship_constraints`、`auto_generation_settings`）は履歴を持たず、現在値のみ
- 物理削除はマスタの誤登録時のみ。運用では論理削除（`is_active=false`）を基本とする

### 6.6 スタッフ異動時の整合性

スタッフが部門・店舗を異動した場合、関連データの取り扱いは以下とする：

- `relationship_constraints`：当該スタッフを含む有効レコードを `is_active = false` にする
  - 異動によりペア前提（同一店舗・同一部門）が崩れるため、自動で無効化する
  - マネジャーは画面で無効化された制約一覧を確認し、必要であれば該当レコードを再有効化（`is_active = true`）する
  - UNIQUE INDEX は全件で重複禁止のため、同じペアの新規 INSERT ではなく既存レコードの再有効化で対応する
- `day_off_requests`：対象年月に紐づくため、過去・当月分はそのまま残す
- `shifts` / `shift_assignments`：対象年月単位で確定済みのため、過去分は変更しない。今後の対象年月から新しい所属で扱う

実装はアプリ層（スタッフ更新APIで一括処理）またはトリガ（`employees` 更新時に `relationship_constraints` を更新）で行う。

### 6.7 Auth と employees の同期

`auth.users.email` を正とし、`public.employees.email` はトリガで追従させる。  
スタッフのプロフィール情報は office のみが直接編集できるため、二重管理の更新窓口は限定される。

#### 同期方針

- 認証情報（email / password）は Supabase Auth API（`auth.admin.updateUserById` / `supabase.auth.updateUser`）経由で更新する
- DB側で `auth.users` の INSERT / UPDATE トリガを定義し、`public.employees.email` を自動反映する
- 直接 `public.employees.email` を UPDATE することは原則禁止（office UI からも email 変更は Auth API 経由とする）

#### 同期トリガ例

```sql
create or replace function public.sync_employee_email()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.employees
     set email = new.email,
         updated_at = now()
   where id = new.id;
  return new;
end;
$$;

create trigger trg_sync_employee_email
after update of email on auth.users
for each row execute function public.sync_employee_email();
```

招待時の初回同期は、招待API呼び出し直後に `employees` を INSERT する（`id = auth.users.id` で揃える）。

### 6.8 office アカウントの初期作成と復旧

office アカウントは店舗ごとに1アカウントの共有運用で、O-01 / O-02 にアクセスするには office ロールでのログインが必要となる。  
このため「店舗に有効な office アカウントが0件、かつ無効化済みも存在しない」状態では、UI からの作成・復旧ができない。

#### 初期作成（新店舗開設時）

- 店舗（`stores`）の追加と同時に、office アカウントをマイグレーションまたは管理用CLIで投入する
- `auth.users` に対する Supabase Auth の招待 API 呼び出しと、`public.employees` への `role = 'office'`、`work_pattern_id = NULL` レコード作成を1セットの運用手順とする

#### 誤無効化からの復旧

- **有効が0件・無効化済みが1件以上残っている場合**：別の office 担当者がいれば、その人にロールフィルタで無効化済みを表示してもらい、O-02 から再有効化できる
- **有効・無効を含めて0件の場合**：UIからの操作はできないため、DB直接操作または管理用CLIで再投入する
- 上記を防ぐため、O-02 のフロント側で「最後の有効な office アカウントの無効化」を物理的にブロックする（仕様の詳細は画面設計書 O-02 参照）

### 6.9 今後の拡張に備える点

- 複数店舗運用：`stores` は既に存在するため、UIのストア切替実装で対応可能
- 人間関係hard制約：`relationship_constraints` に `constraint_level` カラムを追加する形で対応可能
- シフト変更依頼：`shift_change_requests` テーブルを別途追加する形で対応可能

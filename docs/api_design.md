# API設計書

## 1. 概要

### 1.1 方針

- **通常のCRUD**：Next.js から Supabase クライアントSDK (`@supabase/supabase-js`) を経由して PostgREST を直接呼び出す。アクセス制御は RLS が担保する
- **シフト生成・評価**：Python FastAPI（Render）に委譲する。OR-Tools のソルバー処理を Node から分離するため
- **特殊処理（招待メール、サービス間連携）**：Next.js Server Actions / Route Handlers で `service_role` キーを使い、サーバーサイドからのみ実行する
- **Excel出力**：クライアント側で SheetJS を使ってブラウザ内生成（API化しない）

### 1.2 技術構成

| 役割 | ランタイム | デプロイ先 |
|---|---|---|
| Webフロント | Next.js 14 App Router | Vercel |
| 認証 + DB + RLS | Supabase | Supabase Cloud |
| シフト生成エンジン | Python 3.11 FastAPI | Render |

---

## 2. アーキテクチャ

### 2.1 通信パターン

```mermaid
flowchart LR
    Browser[Browser]
    NextJS[Next.js<br/>Vercel]
    Supabase[(Supabase<br/>PostgREST + Auth)]
    FastAPI[FastAPI<br/>Render]

    Browser -->|SSR / RSC| NextJS
    Browser -->|REST + JWT| Supabase
    NextJS -->|service_role| Supabase
    NextJS -->|JWT| FastAPI
    FastAPI -->|service_role| Supabase
```

### 2.2 認証

- **フロント認証**：Supabase Auth（メールアドレス + パスワード）
  - クライアント側は `@supabase/supabase-js` がトークンを自動管理
  - ログイン後の JWT が `Authorization: Bearer <jwt>` として PostgREST に送信され、RLS の `auth.uid()` 等で評価される
- **Next.js → FastAPI**：同じ Supabase JWT を Bearer で送信
  - FastAPI は Supabase の JWKS で署名検証し、`sub` を `auth.uid()` 相当として扱う
- **FastAPI → Supabase**：`service_role` キーで Postgres 直接または PostgREST を呼ぶ
  - service_role は RLS をバイパスするため、データ取得・保存はサーバーサイド責任で行う

### 2.3 認証ヘッダ仕様

| 経路 | ヘッダ | 値 |
|---|---|---|
| Browser → Supabase | `Authorization` | `Bearer <user-jwt>` |
| Browser → Supabase | `apikey` | `<anon-key>` |
| Next.js Server → FastAPI | `Authorization` | `Bearer <user-jwt>` |
| Next.js Server → Supabase | `Authorization` | `Bearer <service-role-key>`（招待などの管理操作） |
| FastAPI → Supabase | `Authorization` | `Bearer <service-role-key>` |

---

## 3. データアクセス層（Supabase 直接呼び出し）

各テーブルへのCRUDは PostgREST 経由で行う。詳細な権限は [db_design.md 4.1 RLS権限マトリクス](./db_design.md#41-権限マトリクス) を参照。本書では画面操作との対応のみ記載する。

### 3.1 employees

| 利用画面 | 操作 | 経路 | 備考 |
|---|---|---|---|
| O-01 | SELECT | Browser → Supabase | RLS により office は自店舗、manager / staff は自部門に絞り込み |
| O-02 新規 | INSERT + Auth Invite | **Server Action `inviteEmployee`**（後述 6.1） | 招待メール送信＋ office 重複チェック |
| O-02 編集 | UPDATE | **Server Action `updateEmployee`**（後述 6.4） | office 関連項目変更時の重複・最後の1人チェックを集約 |
| O-02 無効化 | UPDATE `is_active=false` | **Server Action `updateEmployee`**（後述 6.4） | 最後の有効 office はサーバー側で再検証 |

`employees` の INSERT / UPDATE / DELETE は **すべて Server Action（service_role）経由のみ**。RLS は SELECT のみ許可することで、UI からの直接 PostgREST 更新を物理的にブロックする。

### 3.2 stores / departments / work_patterns

| 利用画面 | 操作 | 経路 |
|---|---|---|
| O-02、F-01 | SELECT | Browser → Supabase |
| F-01 勤務パターンタブ | INSERT / UPDATE / DELETE | Browser → Supabase（manager のみ可、RLS で担保） |

`stores` / `departments` の編集UIは本MVP対象外（運用CLIまたはマイグレーションで管理）。

### 3.3 shift_settings

| 利用画面 | 操作 | 経路 |
|---|---|---|
| F-01 基本設定タブ | SELECT | Browser → Supabase |
| F-01 基本設定タブ | UPDATE | Browser → Supabase（manager のみ） |

シングルトン（`id = 1` のみ）のため、UPDATE のみで INSERT は行わない（マイグレーションで初期投入）。

### 3.4 required_staff_counts / auto_generation_settings

| 利用画面 | 操作 | 経路 |
|---|---|---|
| F-01 必要人数・自動生成条件タブ | SELECT | Browser → Supabase |
| F-01 必要人数・自動生成条件タブ | INSERT / UPDATE / DELETE | Browser → Supabase（manager 自部門のみ） |

### 3.5 relationship_constraints

| 利用画面 | 操作 | 経路 |
|---|---|---|
| F-01 人間関係制約タブ | SELECT | Browser → Supabase |
| F-01 人間関係制約タブ | INSERT / UPDATE | Browser → Supabase（manager 自部門のみ） |

スタッフ異動時の自動無効化は `employees` 更新トリガで処理する（DB側）。

### 3.6 day_off_requests

| 利用画面 | 操作 | 経路 | RLS制約 |
|---|---|---|---|
| F-02 staff モード | SELECT / INSERT / UPDATE / DELETE | Browser → Supabase | 自分のレコードのみ、かつ締切前のみ |
| F-02 manager モード | SELECT / INSERT / UPDATE / DELETE | Browser → Supabase | 自部門のレコード、締切前後問わず |

締切判定は DB ファンクション `is_day_off_editable(target_date)` を staff の WITH CHECK 内で参照する。

### 3.7 shifts / shift_assignments

| 利用画面 | 操作 | 経路 | 備考 |
|---|---|---|---|
| F-03 閲覧 | SELECT | Browser → Supabase | RLS で表示範囲制御 |
| F-03 編集（手動） | INSERT / UPDATE / DELETE on `shift_assignments` | **RPC `fn_upsert_shift_assignment` / `fn_delete_shift_assignment`** | 楽観ロック付き、`shifts.updated_at` を一致確認 |
| F-03 公開切替 | UPDATE on `shifts.status` | **RPC `fn_publish_shift`** | manager のみ、楽観ロック付き |
| F-03 生成 | （後述 6.2 `generateShift`） | Server Action → FastAPI | |

`shifts` / `shift_assignments` の INSERT / UPDATE / DELETE は **すべて RPC または FastAPI（service_role）経由のみ**。RLS は SELECT のみ許可。RPC の詳細は [db_design.md 6.2 楽観ロック](./db_design.md#62-楽観ロック手動編集) を参照。

#### 競合検出時の挙動

- RPC 内で `shifts.updated_at` の不一致を検出すると `P0001` 例外を発生
- Browser 側は Supabase JS の `.rpc()` 呼び出しでエラーを受け取り、HTTP 換算 `409 Conflict` 相当として処理
- 画面で「他のユーザーが更新しました」モーダル → 再読込を誘導

### 3.8 楽観ロック付き手動編集 RPC の入出力契約

クライアント（Browser）から `supabase.rpc('<関数名>', { ... })` で呼び出す。RPC 関数の SQL 実装は [db_design.md 6.2](./db_design.md#62-楽観ロック手動編集) を参照。

#### 3.8.1 `fn_upsert_shift_assignment`

スタッフ割当の追加・変更を行う。

| 引数 | 型 | NULL | 説明 |
|---|---|---|---|
| p_shift_id | uuid | NOT NULL | 対象シフトID |
| p_target_date | date | NOT NULL | 勤務日 |
| p_work_pattern_id | uuid | NOT NULL | 勤務パターンID |
| p_staff_id | uuid | NOT NULL | 割当スタッフID |
| p_expected_updated_at | timestamptz | NOT NULL | 楽観ロック比較用（編集時に取得した shifts.updated_at） |
| p_assignment_id | uuid | NULL可 | NULL で新規 INSERT、指定で該当 assignment の UPDATE |

**戻り値**：作成・更新後の `shift_assignments` 行（1件）

**エラーコード**：

| コード | 発生条件 | HTTP 換算 | クライアント対応 |
|---|---|---|---|
| `P0001` | shifts.updated_at が `p_expected_updated_at` と不一致 | 409 | 競合モーダル → 再読込 |
| `P0002` | shift_id が存在しない | 404 | エラー表示 |
| `23505`（unique_violation） | 同一スタッフが同日に既に割当済（1日1シフト制約違反） | 409 | 「このスタッフは同日に別シフトに割当済」と表示 |
| `23503`（foreign_key_violation） | staff_id / work_pattern_id が存在しない | 400 | バリデーションエラー表示 |

**手動編集時のドメイン違反の扱い**：

- 必要人数超過、希望休衝突、勤務パターン不一致、連勤超過などの **整合性違反は RPC 側では弾かない**（manager の緊急対応で違反割当を許容するため）
- 警告表示はクライアント側で計算し、F-03 の編集モーダル（候補者リスト）でアイコン表示する

#### 3.8.2 `fn_delete_shift_assignment`

スタッフ割当の削除を行う。

| 引数 | 型 | NULL | 説明 |
|---|---|---|---|
| p_assignment_id | uuid | NOT NULL | 削除対象 |
| p_shift_id | uuid | NOT NULL | 親シフトID（楽観ロック対象） |
| p_expected_updated_at | timestamptz | NOT NULL | 楽観ロック比較用 |

**戻り値**：void（成功時のみ完了）

**エラーコード**：

| コード | 発生条件 | HTTP 換算 |
|---|---|---|
| `P0001` | shifts.updated_at 不一致 | 409 |
| `P0002` | shift_id が存在しない | 404 |
| `P0003` | assignment_id が存在しない、または shift_id 配下にない | 404 |

#### 3.8.3 `fn_publish_shift`

シフトの公開／非公開ステータスを切り替える。

| 引数 | 型 | NULL | 説明 |
|---|---|---|---|
| p_shift_id | uuid | NOT NULL | 対象シフト |
| p_expected_updated_at | timestamptz | NOT NULL | 楽観ロック比較用 |
| p_status | text | NOT NULL | `'draft'` または `'published'` |

**戻り値**：更新後の `shifts` 行（1件）

**エラーコード**：

| コード | 発生条件 | HTTP 換算 |
|---|---|---|
| `P0001` | shifts.updated_at 不一致 | 409 |
| `P0002` | shift_id が存在しない | 404 |
| `P0004`（invalid_status） | `p_status` が許容値以外 | 400 |

#### 3.8.4 共通仕様

- すべての RPC は `SECURITY DEFINER` で定義し、関数オーナー権限で実行する
- 関数内で呼び出し元の `auth.uid()` から employees を読み、`role='manager'` かつ自店舗自部門の shift であることを検証する（service_role 越権を防ぐ追加防御）
- ステータスや shift の所有部門が呼び出し元と一致しない場合は `P0005`（forbidden）を発生し 403 換算

---

## 4. FastAPI エンドポイント

### 4.1 ベース仕様

- ベースURL：`https://<render-host>/api/v1`
- 認証：`Authorization: Bearer <Supabase JWT>`
- リクエスト/レスポンス：`application/json`
- 文字コード：UTF-8
- エラー形式：[7.1 共通エラー形式](#71-共通エラー形式) 参照

#### 認可ガード（全エンドポイント共通）

FastAPI は service_role で Supabase にアクセスするため RLS は効かない。代わりに、各エンドポイントで以下のガードを通す：

1. **JWT 署名検証**：Supabase の JWKS で署名と有効期限を検証
2. **employees 取得**：`auth.uid()` をキーに `employees` から `role` / `store_id` / `department_id` / `is_active` を取得
3. **権限チェック**：
   - `is_active = true` でなければ `403 forbidden`
   - エンドポイントが要求するロール（例：`manager`）でなければ `403 forbidden`
   - リクエストの `store_id` / `department_id` が呼び出し元と一致しなければ `403 forbidden`
4. 上記すべて通過した場合のみ本処理に進む

実装イメージ（FastAPI の Depends で再利用）：

```python
async def require_manager_in_scope(
    request: ScopeRequest,
    user_id: UUID = Depends(verify_jwt_and_get_user_id),
    supabase: Client = Depends(get_service_role_client),
) -> dict:
    employee = (
        supabase.from_("employees")
        .select("role, store_id, department_id, is_active")
        .eq("id", str(user_id))
        .single()
        .execute()
    )
    if not employee.data or not employee.data["is_active"]:
        raise HTTPException(403, "forbidden")
    if employee.data["role"] != "manager":
        raise HTTPException(403, "forbidden")
    if employee.data["store_id"] != str(request.store_id):
        raise HTTPException(403, "forbidden")
    if employee.data["department_id"] != str(request.department_id):
        raise HTTPException(403, "forbidden")
    return employee.data
```

### 4.2 POST `/shifts/generate`

対象年月のシフトを自動生成する。

#### リクエスト

```json
{
  "target_year_month": "2026-06-01",
  "store_id": "8e0f...",
  "department_id": "1234...",
  "version": "v8",
  "overwrite_existing": true
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| target_year_month | string (date) | ✓ | 対象月の月初日 (YYYY-MM-01) |
| store_id | uuid | ✓ | 店舗ID |
| department_id | uuid | ✓ | 部門ID |
| version | string | | 生成段階。省略時は最新版（`v8`） |
| overwrite_existing | bool | | true で既存シフト上書き。省略時は false |

#### レスポンス（成功）`200 OK`

```json
{
  "status": "success",
  "shift_id": "abcd...",
  "assignments_count": 150,
  "evaluation": {
    "day_off_violations": 0,
    "required_staff_shortage": 0,
    "required_staff_excess": 0,
    "consecutive_violations": 0,
    "soft_constraint_violations": 1,
    "per_staff": [
      {
        "staff_id": "...",
        "workdays": 18,
        "weekend_workdays": 5,
        "monthly_minutes": 8640
      }
    ],
    "fairness": {
      "by_employment_type": {
        "正社員": { "stddev_workdays": 0.5, "stddev_minutes": 60 },
        "パート": { "stddev_workdays": 1.2, "stddev_minutes": 120 }
      }
    }
  }
}
```

#### レスポンス（生成不可）`200 OK`

```json
{
  "status": "infeasible",
  "reasons": [
    {
      "type": "staff_shortage",
      "target_date": "2026-06-15",
      "work_pattern_id": "...",
      "work_pattern_name": "午前",
      "required": 3,
      "available_candidates": 1,
      "shortage_breakdown": {
        "day_off_blocked": 1,
        "consecutive_limit_blocked": 0,
        "pattern_mismatch_blocked": 1
      }
    }
  ]
}
```

`reasons[].type` の値：

| type | 説明 |
|---|---|
| staff_shortage | 必要人数を満たせない |
| day_off_excess | 希望休制約により候補不足 |
| consecutive_limit | 連勤制限による候補不足 |
| pattern_mismatch | 勤務パターン制約による候補不足 |

#### エラー応答

| HTTP | コード | 説明 |
|---|---|---|
| 400 | `validation_failed` | リクエスト不正（store/department/対象年月の形式不正等） |
| 401 | `unauthorized` | JWT 不正・期限切れ |
| 403 | `forbidden` | 認可ガード違反（`is_active=false` / `role <> 'manager'` / `store_id` または `department_id` が不一致） |
| 409 | `shift_already_exists` | 既存シフトあり、`overwrite_existing=false` |
| 500 | `internal_error` | ソルバー異常終了等 |

### 4.3 POST `/shifts/{shift_id}/evaluate`

既存シフトを再評価する。手動編集後に呼び出す想定。

#### リクエスト

ボディなし。

#### レスポンス `200 OK`

```json
{
  "shift_id": "...",
  "evaluation": {
    "day_off_violations": 0,
    "required_staff_shortage": 0,
    "required_staff_excess": 0,
    "consecutive_violations": 0,
    "soft_constraint_violations": 1,
    "per_staff": [ ... ],
    "fairness": { ... }
  }
}
```

`evaluation` の構造は [4.2 generate](#42-post-shiftsgenerate) と同じ。

#### エラー応答

| HTTP | コード | 説明 |
|---|---|---|
| 401 | `unauthorized` | JWT 不正 |
| 403 | `forbidden` | 認可ガード違反（対象 shift の `store_id` / `department_id` が呼び出し元と不一致） |
| 404 | `shift_not_found` | shift_id に該当なし |

### 4.4 GET `/health`

ヘルスチェック。Render の Healthcheck Endpoint として利用。

#### レスポンス `200 OK`

```json
{ "status": "ok", "version": "1.0.0" }
```

---

## 5. シフト生成 内部処理フロー

`POST /shifts/generate` の処理フロー：

```mermaid
sequenceDiagram
    participant N as Next.js
    participant F as FastAPI
    participant S as Supabase

    N->>F: POST /shifts/generate (JWT)
    F->>F: JWT検証 (JWKS)
    F->>S: SELECT employees<br/>(role / store_id / department_id / is_active)
    F->>F: 認可ガード<br/>(role=manager かつ scope 一致)
    alt 認可違反
        F->>N: 403 forbidden
    end
    F->>S: SELECT work_patterns,<br/>day_off_requests, required_staff_counts,<br/>auto_generation_settings, relationship_constraints
    F->>F: 制約モデル構築 + OR-Tools解探索
    alt 解あり
        F->>S: BEGIN
        F->>S: DELETE FROM shift_assignments WHERE shift_id=...
        F->>S: UPSERT shifts
        F->>S: INSERT shift_assignments (bulk)
        F->>S: COMMIT
        F->>F: 評価計算
        F->>N: 200 success + evaluation
    else 解なし
        F->>F: 不足理由分析
        F->>N: 200 infeasible + reasons
    end
```

`shifts.status` は `'draft'` で保存。manager が F-03 から公開操作で `'published'` に切替える。

---

## 6. Next.js Server Actions / Route Handlers

クライアントから直接呼べないサーバー側処理。

### 6.0 共通：呼び出し元認可ガード

すべての Server Action は冒頭で **呼び出し元の認可** を確認する。`service_role` を使う以上、UI 側を信用せず Server Action 内部で再検証する。

```typescript
async function requireOfficeInScope(targetStoreId: string) {
  const { data: { user } } = await supabaseServer.auth.getUser()
  if (!user) throw new ApiError('unauthorized', 401)

  const { data: caller } = await supabaseServer
    .from('employees')
    .select('role, store_id, is_active')
    .eq('id', user.id)
    .single()

  if (!caller || !caller.is_active) throw new ApiError('forbidden', 403)
  if (caller.role !== 'office') throw new ApiError('forbidden', 403)
  if (caller.store_id !== targetStoreId) throw new ApiError('forbidden', 403)
}
```

employees 操作系の Server Action（`inviteEmployee` / `updateEmployee`）はこのガードを冒頭で必ず通す。シフト系（`generateShift` / `evaluateShift`）は manager ロールチェックを行う同等のガードを使う（FastAPI 側のガードと同等の処理を Server Action 側でも先に弾く）。

### 6.1 `inviteEmployee(input)`

スタッフ登録（O-02 新規）に対応。

#### 入力

```typescript
type InviteEmployeeInput = {
  email: string
  store_id: string
  role: 'office' | 'manager' | 'staff'
  // role別の追加項目
  last_name?: string
  first_name?: string
  account_name?: string  // office用
  department_id?: string | null
  employment_type?: '正社員' | '契約社員' | 'パート' | 'アルバイト'
  work_pattern_id?: string | null
  monthly_max_workdays?: number | null
  max_consecutive_workdays?: number  // デフォルト4
  is_active?: boolean
}
```

#### 処理

1. **呼び出し元認可ガード**：`requireOfficeInScope(input.store_id)` を実行（6.0 参照）
2. ロール別バリデーション（office用のダミー値補完を含む）
3. office の場合：対象店舗に有効な office が存在しないことを確認
4. Supabase Auth Admin API で招待メール送信（`auth.admin.inviteUserByEmail`）
5. `auth.users.id` を取得
6. `public.employees` に INSERT（`id = auth.users.id`）
7. 成功時は employees レコードを返す

#### エラーケース

- 認可エラー（`unauthorized` / `forbidden`）
- メールアドレス重複
- office 重複（1店舗1office制約違反）
- バリデーションエラー

### 6.2 `generateShift(input)`

F-03 シフト生成ボタンに対応する FastAPI ラッパー。

#### 入力

```typescript
type GenerateShiftInput = {
  target_year_month: string  // YYYY-MM-01
  store_id: string
  department_id: string
  overwrite_existing?: boolean
}
```

#### 処理

1. ユーザーJWTを取得
2. FastAPI の `POST /shifts/generate` を呼び出し
3. レスポンスをそのままクライアントに返す
4. ネットワークエラーは `internal_error` でラップ

### 6.3 `evaluateShift(shift_id)`

手動編集後の再評価（F-03 で「再評価」ボタン押下時、または編集確定時）。

FastAPI の `POST /shifts/{shift_id}/evaluate` を呼ぶラッパー。

### 6.4 `updateEmployee(employee_id, input)`

スタッフ編集・無効化（O-02 編集／無効化ボタン）。**O-02 のすべての更新操作はこの Server Action を経由する**（Browser からの直接 PostgREST 更新は RLS で禁止）。

#### 入力

```typescript
type UpdateEmployeeInput = {
  // 更新対象項目（部分更新を許可）
  last_name?: string
  first_name?: string
  account_name?: string  // office用
  store_id?: string
  role?: 'office' | 'manager' | 'staff'
  department_id?: string | null
  employment_type?: '正社員' | '契約社員' | 'パート' | 'アルバイト'
  work_pattern_id?: string | null
  monthly_max_workdays?: number | null
  max_consecutive_workdays?: number
  is_active?: boolean
}
```

#### 処理

1. 現状の employees レコードを取得
2. **呼び出し元認可ガード**：`requireOfficeInScope(現在のstore_id)` を実行。`store_id` 変更を伴う場合は変更後の `store_id` も同じガードで検証する
3. **office 関連項目（`role` / `store_id` / `is_active`）に変更がある場合**：
   - 変更後の店舗で `role='office' AND is_active=true` の重複が発生しないかチェック
   - `is_active=false` への変更時：対象店舗の有効な office が他に1名以上残るかチェック（最後の1人なら拒否）
4. 通常項目の更新も含めて service_role で `employees` を UPDATE
5. 部門変更があった場合、関連する `relationship_constraints` の自動無効化（DBトリガで実行されるが、再評価誘導のメッセージを返す）
6. 更新後の employees レコードを返す

#### エラーケース

- 認可エラー（`unauthorized` / `forbidden`）
- office 重複（1店舗1office制約違反）
- 最後の有効 office の無効化試行
- バリデーションエラー

---

## 7. 共通仕様

### 7.1 共通エラー形式

```json
{
  "error": "<error_code>",
  "message": "<human readable message>",
  "details": { ... }
}
```

| エラーコード | HTTP | 説明 |
|---|---|---|
| `unauthorized` | 401 | 未認証または JWT 不正 |
| `forbidden` | 403 | 認可エラー |
| `not_found` | 404 | リソース不在 |
| `validation_failed` | 400 | 入力バリデーションエラー |
| `conflict` | 409 | 状態競合（楽観ロック等） |
| `shift_already_exists` | 409 | 既存シフトあり、上書き不許可 |
| `shift_not_found` | 404 | shift_id 不在 |
| `internal_error` | 500 | サーバー内部エラー |

### 7.2 日付・時刻形式

- 日付：`YYYY-MM-DD`（ISO 8601）
- 日時：`YYYY-MM-DDTHH:mm:ss±HH:MM`（ISO 8601、原則 JST `+09:00`）
- target_year_month：`YYYY-MM-01`（月初日）

### 7.3 ID 形式

- すべて UUID v4 文字列（小文字ハイフン区切り）

### 7.4 バージョニング

- FastAPI のパスに `/api/v1/` を含める
- 破壊的変更時は `/api/v2/` を新設し、旧版を一定期間並行運用

### 7.5 ページング

MVPでは想定データ量が小さい（30名 × 1ヶ月 = ~900件）ため、ページングは未実装。  
将来必要になった場合は `?limit=50&offset=0` 形式で追加する。

---

## 8. セキュリティ

### 8.1 通信

- 全経路 HTTPS 強制
- HSTS 有効化（Vercel / Render の標準設定）

### 8.2 CORS

- FastAPI の Allowed Origins：本番フロント origin のみ
- preflight キャッシュ：86400秒

### 8.3 シークレット管理

| 環境変数 | 用途 | 配置先 |
|---|---|---|
| `SUPABASE_URL` | Supabase エンドポイント | Vercel / Render |
| `SUPABASE_ANON_KEY` | フロント認証用 | Vercel（公開可） |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバー専用 | Vercel Server / Render（秘匿） |
| `SUPABASE_JWT_SECRET` または JWKS URL | JWT検証 | Render |

### 8.4 レート制限

- FastAPI：`slowapi` 等で 60 req/min/user を上限に設定
- シフト生成エンドポイントは 10 req/min/user に絞る（重い処理のため）

### 8.5 ログ

- リクエスト ID（`X-Request-Id`）を全経路で伝播
- 個人情報は出力しない（メールアドレス、氏名はマスク）
- エラーログには user_id、request_id、エラーコードのみ含める

---

## 9. 補足

### 9.1 画面・DBとの対応

| 画面ID | 主な操作 | API経路 |
|---|---|---|
| C-01〜C-04 | 認証 | Supabase Auth API（直接） |
| C-05 | ロール判定 | `auth.uid()` + employees SELECT |
| F-01 | 設定タブごとのCRUD | Supabase 直接（テーブル別） |
| F-02 staff | 希望休 CRUD | Supabase 直接、RLS で締切判定 |
| F-02 manager | 希望休 CRUD（締切後可） | Supabase 直接 |
| F-03 閲覧 | shifts/shift_assignments SELECT | Supabase 直接 |
| F-03 生成 | シフト生成 | `generateShift()` → FastAPI |
| F-03 編集 | shift_assignments INSERT/UPDATE/DELETE | RPC `fn_upsert_shift_assignment` / `fn_delete_shift_assignment` |
| F-03 再評価 | 評価再計算 | `evaluateShift()` → FastAPI |
| F-03 公開 | shifts.status UPDATE | RPC `fn_publish_shift` |
| O-01 | employees SELECT | Supabase 直接 |
| O-02 新規 | 招待 + INSERT | `inviteEmployee()` Server Action |
| O-02 編集 | employees UPDATE | `updateEmployee()` Server Action |
| O-02 無効化 | employees UPDATE | `updateEmployee()` Server Action |

### 9.2 Excel 出力

クライアント側で SheetJS により生成し、`Blob` をダウンロード。サーバー側API化は行わない。

### 9.3 リアルタイム更新

MVPでは未対応。  
将来、シフト編集の同時編集体験を改善する場合は Supabase Realtime（`shifts` / `shift_assignments` の変更通知購読）を追加する。

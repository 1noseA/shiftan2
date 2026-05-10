# シフト生成アルゴリズム設計書

## 1. 概要

### 1.1 目的

`POST /api/v1/shifts/generate` の実装仕様を定義する。  
対象年月・店舗・部門単位で、希望休・必要人数・連勤制限・人間関係制約・公平性を考慮したシフトを自動生成する。

### 1.2 方針

- 自動生成は最初から完成形を目指さず、v0〜v8 を段階的に実装する（要件 3.6.2 参照）
- v0〜v3 までは単純な Python ヒューリスティックで実装可
- v4 以降（連勤制限、勤務パターン、人間関係、公平性）からは [OR-Tools CP-SAT Solver](https://developers.google.com/optimization/cp/cp_solver) を用いる
- API契約・入出力は [api_design.md 4.2](./api_design.md#42-post-shiftsgenerate) を参照
- DB入出力は [db_design.md](./db_design.md) を参照

### 1.3 技術構成

| 項目 | 内容 |
|---|---|
| 言語 | Python 3.11+ |
| Webフレームワーク | FastAPI |
| 最適化ソルバー | OR-Tools CP-SAT（v4以降） |
| 祝日判定 | `jpholiday` |
| データ操作 | `pandas`（任意） |
| デプロイ | Render |

---

## 2. 入力データ

生成エンジンは Supabase（service_role）から以下を取得する。範囲はリクエストの `store_id` / `department_id` / `target_year_month` で絞り込む。

| 入力 | 取得元テーブル | 用途 |
|---|---|---|
| 対象スタッフ | `employees` (`role IN ('manager','staff')`, `is_active=true`, `store_id`, `department_id`, `work_pattern_id IS NOT NULL`) | 割当候補 |
| 勤務パターン | `work_patterns` (`is_active=true`) | 割当先 |
| 必要人数 | `required_staff_counts` (`store_id`, `department_id`) | 平日／休日 × 勤務パターンごとの必要数 |
| 希望休 | `day_off_requests` (対象スタッフ × 対象月) | ハード制約 |
| 自動生成条件 | `auto_generation_settings` (`store_id`, `department_id`) | 制約フラグ |
| 人間関係制約 | `relationship_constraints` (`store_id`, `department_id`, `is_active=true`) | ソフト制約 |
| 基本設定 | `shift_settings` (シングルトン) | 希望休上限等の参照（直接の制約ではない） |
| 個別最大連勤日数 | `employees.max_consecutive_workdays` | スタッフごとの連勤上限 |
| 月間最大勤務日数 | `employees.max_workdays_per_month`（NULL可） | スタッフごとの勤務日数上限 |
| 祝日 | `jpholiday` ライブラリ | 平日／休日判定 |

---

## 3. 数学モデル

### 3.1 集合と添字

| 記号 | 集合 | 説明 |
|---|---|---|
| D | 日付 | 対象年月の全日（例：2026年6月なら30日） |
| P | 勤務パターン | 有効な `work_patterns` の集合 |
| S | スタッフ | 対象 employees の集合 |
| W ⊂ D | 休日 | 土・日・祝日 |

各勤務パターン p について：
- `working_minutes[p]`：実働分

各スタッフ s について：
- `wp[s]`：そのスタッフに割り当てられた勤務パターン (`employees.work_pattern_id`)
- `max_cons[s]`：最大連勤日数 (`employees.max_consecutive_workdays`)
- `max_days[s]`：月間最大勤務日数（NULL のときは無制約）
- `etype[s]`：雇用区分（`employment_type`）

各日付 d について：
- `day_type[d] ∈ {weekday, holiday}`

各 (d, p) について：
- `req[d, p]`：`required_staff_counts.required_count`（`day_type[d]` と `p` で決定）

希望休集合：
- `DOff = {(d, s) | (d, s) ∈ day_off_requests}`

人間関係制約集合：
- `R = {(s_a, s_b) | (s_a, s_b) ∈ relationship_constraints, is_active=true}`

### 3.2 決定変数

```
x[d, p, s] ∈ {0, 1}    ∀(d, p, s) ∈ D × P × S
  = 1 if スタッフ s が日付 d に勤務パターン p で割り当て
  = 0 それ以外
```

派生変数：

```
y[d, s] = Σ_p x[d, p, s]    # スタッフ s が日付 d に出勤するか（0 or 1）
```

### 3.3 ハード制約（v1〜v5）

#### フラグ制御マップ

各ハード制約は `auto_generation_settings` のフラグまたはスタッフ個別属性で有効／無効を切り替える。フラグ OFF の制約は **モデルに追加しない**（仕様上「効かない」状態とする）。

| 制約 | 制御フラグ | OFF時の挙動 |
|---|---|---|
| H1 必要人数 | 常時ON（フラグなし） | 生成の前提のため無効化不可 |
| H2 1日1シフト | 常時ON（フラグなし） | 常に有効。同日複数割当は仕様上存在しない |
| H3 希望休 | `enable_day_off_hard` | 制約を加えない（希望休を無視して割当可能） |
| H4 勤務パターン一致 | `enable_workable_pattern` | 制約を加えない（任意のパターン割当を許可） |
| H5 最大連勤日数 | `enable_max_consecutive` | 制約を加えない |
| H6 月間最大勤務日数 | スタッフ単位（`max_workdays_per_month is not null`） | 該当スタッフのみ無効 |

ソフト制約（F_weekend / F_minutes / R_pen / C_pen）は対応する `enable_*` フラグ OFF 時に重み係数を 0 にする（3.5 参照）。

実装イメージ：

```python
add_one_shift_per_day_constraint(model, x)
if settings.enable_day_off_hard:
    add_day_off_hard_constraint(model, x, day_off_set)
if settings.enable_workable_pattern:
    fix_pattern_mismatch_to_zero(model, x, work_pattern_per_staff)
if settings.enable_max_consecutive:
    add_consecutive_limit_constraint(model, y, max_cons_per_staff)
# H6 はスタッフごとに条件付きで追加
for s in staff_list:
    if s.max_workdays_per_month is not None:
        add_monthly_max_constraint(model, y, s)
```

#### H1. 必要人数の充足（v2）

```
∀d ∈ D, ∀p ∈ P:    Σ_s x[d, p, s] = req[d, p]
```

不足が許容できない（infeasible 時は失敗）。超過も発生しないように等号にする。

#### H2. 1日1シフト（v3）

```
∀d ∈ D, ∀s ∈ S:    Σ_p x[d, p, s] ≤ 1
```

#### H3. 希望休（v1）

```
∀(d, s) ∈ DOff:    Σ_p x[d, p, s] = 0
```

#### H4. 勤務パターンの一致（v5）

```
∀d ∈ D, ∀s ∈ S, ∀p ∈ P with p ≠ wp[s]:    x[d, p, s] = 0
```

実装上は wp[s] 以外のパターンに関する変数を作らず、定数 0 で固定するのが効率的。

#### H5. 最大連勤日数（v4）

```
∀s ∈ S, ∀d ∈ D such that d + max_cons[s] ≤ |D|:
    Σ_{i=0..max_cons[s]} y[d+i, s] ≤ max_cons[s]
```

つまり連続する `max_cons[s] + 1` 日のうち、勤務日は `max_cons[s]` 日以下。

#### H6. 月間最大勤務日数（オプション）

```
∀s ∈ S with max_days[s] is not null:    Σ_d y[d, s] ≤ max_days[s]
```

### 3.4 ソフト制約（v6〜v8）

目的関数は以下の重み付き和を最小化：

```
min  α₁·F_weekend + α₂·F_minutes + α₃·R_pen + α₄·C_pen
```

#### F_weekend（v7：土日出勤回数の公平性）

雇用区分グループ G ごとに、出勤回数の偏差を最小化する。  
標準偏差は CP-SAT で扱いにくいため **「グループ内最大 − 最小」** を最小化する形で線形化する。

```
weekend_work[s] = Σ_{d ∈ W} y[d, s]    ∀s

For each group g:
    max_g ≥ weekend_work[s]    ∀s ∈ S_g
    min_g ≤ weekend_work[s]    ∀s ∈ S_g
F_weekend = Σ_g (max_g - min_g)
```

#### F_minutes（v8：月間労働時間の公平性）

同様に、雇用区分グループごとの月間労働時間（分単位）の最大−最小を最小化。

```
monthly_min[s] = Σ_{d, p} x[d, p, s] · working_minutes[p]
For each group g:
    max_min_g ≥ monthly_min[s]    ∀s ∈ S_g
    min_min_g ≤ monthly_min[s]    ∀s ∈ S_g
F_minutes = Σ_g (max_min_g - min_min_g)
```

#### R_pen（v6：人間関係 soft 制約）

ペア (s_a, s_b) ∈ R が同じ (d, p) に同時に入る回数を最小化する。  
2次項を補助変数 z で線形化：

```
∀(s_a, s_b) ∈ R, ∀d, ∀p:
    z[d, p, s_a, s_b] ≤ x[d, p, s_a]
    z[d, p, s_a, s_b] ≤ x[d, p, s_b]
    z[d, p, s_a, s_b] ≥ x[d, p, s_a] + x[d, p, s_b] - 1
    z[d, p, s_a, s_b] ∈ {0, 1}

R_pen = Σ z[d, p, s_a, s_b]
```

#### C_pen（不必要な連勤の回避）

連続勤務をできるだけ避けたい場合のソフト制約：

```
cons[s, d] = y[d, s] · y[d+1, s]  （線形化）
C_pen = Σ_{s, d} cons[s, d]
```

これも `cons` 補助変数で2次項を線形化する。

### 3.5 重み係数

設計時の初期値（運用しながらチューニング）：

| 係数 | 値 | 説明 |
|---|---|---|
| α₁ (weekend) | 100 | 土日公平性 |
| α₂ (minutes) | 1 | 労働時間公平性（分単位なので係数は小さく） |
| α₃ (relationship) | 50 | 人間関係 soft |
| α₄ (consecutive) | 1 | 連勤回避 |

`auto_generation_settings.enable_*` が false のソフト制約は係数 0 とする。

---

## 4. 段階的実装計画

| バージョン | 追加要素 | 実装方式 | 補足 |
|---|---|---|---|
| v0 | 必要人数分のスタッフをランダム仮割当 | 純粋 Python | 動作確認用、制約なし |
| v1 | 希望休をハード制約として除外 | 純粋 Python | フィルタ追加 |
| v2 | 日付ごとの必要人数を厳密に満たす | 純粋 Python or CP-SAT | 不足時は失敗 |
| v3 | 1人1日1シフト制限 | 純粋 Python or CP-SAT | 既割当チェック |
| v4 | 連勤制限 | **CP-SAT 推奨** | スライディングウィンドウ制約 |
| v5 | スタッフごとの勤務パターン制約 | CP-SAT | wp[s] 以外を 0 固定 |
| v6 | 人間関係 soft 制約 | CP-SAT | 補助変数で線形化、目的関数項 |
| v7 | 土日出勤回数の公平性 | CP-SAT | 雇用区分グループ内の最大−最小を最小化 |
| v8 | 月間労働時間の公平性 | CP-SAT | 同上、分単位 |

v4 で OR-Tools 導入後は、以降の制約はすべて目的関数または制約として CP-SAT モデルに追加していく。

---

## 5. 失敗時の原因分析

### 5.1 ソルバーステータス別の判定

CP-SAT の `solver.Solve()` の戻り値（`solver.StatusName()`）と、実行可能解の有無で API 応答と DB 保存の挙動を確定させる。

| ソルバーステータス | 実行可能解 | API 応答 | DB保存 | 備考 |
|---|---|---|---|---|
| `OPTIMAL` | あり | `200 success` | ✓ | 最適解 |
| `FEASIBLE` | あり | `200 success` | ✓ | 実行可能解（最適性は未保証） |
| `UNKNOWN` | あり（中間解） | `200 success`（警告付き） | ✓ | タイムアウト時の中間解。最適性は保証されない |
| `UNKNOWN` | なし | `200 timeout_no_solution` | × | タイムアウトかつ解未発見。infeasible の証明ではないため緩和診断は行わない |
| `INFEASIBLE` | なし | `200 infeasible` | × | 制約矛盾（証明済み）。原因分析を返す（5.3 / 5.4） |
| `MODEL_INVALID` | なし | `500 internal_error` | × | モデル構築エラー |

API レスポンスには `solver_status` フィールドを含めて、クライアント側で警告表示できるようにする：

```json
{
  "status": "success",
  "shift_id": "...",
  "solver_status": "UNKNOWN_WITH_SOLUTION",
  "evaluation": { ... }
}
```

`solver_status` の値：

| 値 | 対応するソルバー結果 |
|---|---|
| `OPTIMAL` | OPTIMAL |
| `FEASIBLE` | FEASIBLE |
| `UNKNOWN_WITH_SOLUTION` | UNKNOWN（解あり） |
| `TIMEOUT_NO_SOLUTION` | UNKNOWN（解なし） |
| `INFEASIBLE` | INFEASIBLE（制約矛盾が証明された場合のみ） |

### 5.2 候補数による事前検出

CP-SAT の前段で、簡易な候補数チェックを行う：

```
∀(d, p):
    candidates[d, p] = {s ∈ S | wp[s] = p, (d, s) ∉ DOff, ...}
    if |candidates[d, p]| < req[d, p]:
        理由を蓄積（type='staff_shortage'）
```

連勤制限は事前検出が難しいため CP-SAT 後の判定で扱う。

### 5.3 失敗原因の分解

`/shifts/generate` レスポンスの `reasons[]` に以下を含める（[api_design.md 4.2](./api_design.md#42-post-shiftsgenerate) と整合）：

| type | 集計内容 |
|---|---|
| `staff_shortage` | `|candidates[d, p]| < req[d, p]` の (d, p) を抽出 |
| `day_off_excess` | `candidates[d, p]` を計算する際、希望休でブロックされたスタッフ数を `shortage_breakdown.day_off_blocked` に集計 |
| `pattern_mismatch` | 同様に勤務パターン不一致でブロックされた数を `pattern_mismatch_blocked` に集計 |
| `consecutive_limit` | CP-SAT 失敗時、制約緩和診断で連勤制限が原因の (d, p) を集計 |

### 5.4 段階的緩和診断（v4以降）

CP-SAT が `INFEASIBLE` を返した場合にのみ実施する（`UNKNOWN` かつ解なしのケースは時間切れであって制約矛盾の証明ではないため、緩和診断を行っても誤診になる）。ハード制約を順に緩和して再求解し、ボトルネックを特定する：

1. H5（連勤制限）を外して解けるか試す → 解ければ「連勤制限が原因」
2. H6（月間最大勤務日数）を外して解けるか試す → 解ければ「月間上限が原因」
3. H4（勤務パターン）を外して解けるか試す → 解ければ「勤務パターン制約が原因」

得られた診断結果を `reasons[].type` に翻訳して返す。

---

## 6. 評価指標の計算

`/shifts/generate` および `/shifts/{shift_id}/evaluate` のレスポンス `evaluation` を計算する。

### 6.1 違反数

| 指標 | 計算式 |
|---|---|
| `day_off_violations` | `Σ_{(d,s) ∈ DOff} y[d, s]` |
| `required_staff_shortage` | `Σ_{d, p} max(0, req[d, p] − Σ_s x[d, p, s])` |
| `required_staff_excess` | `Σ_{d, p} max(0, Σ_s x[d, p, s] − req[d, p])` |
| `consecutive_violations` | スタッフごとのスライディングウィンドウで `max_cons[s]+1` 連勤を検出した件数 |
| `soft_constraint_violations` | `R_pen`（同一 d,p に同居したペアの実数） |

### 6.2 スタッフ別指標 (`per_staff[]`)

| フィールド | 計算式 |
|---|---|
| `workdays` | `Σ_d y[d, s]` |
| `weekend_workdays` | `Σ_{d ∈ W} y[d, s]` |
| `monthly_minutes` | `Σ_{d, p} x[d, p, s] · working_minutes[p]` |

### 6.3 公平性指標 (`fairness.by_employment_type`)

雇用区分ごとに集計：

```
For each group g (etype):
    workdays_array_g = [workdays[s] for s ∈ S_g]
    minutes_array_g  = [monthly_minutes[s] for s ∈ S_g]
    stddev_workdays_g = numpy.std(workdays_array_g)
    stddev_minutes_g  = numpy.std(minutes_array_g)
```

レスポンスには各 group の `stddev_workdays` と `stddev_minutes` を含める。

---

## 7. パフォーマンス

### 7.1 目標

要件 4.2 より：
- 30秒以内目標、最大 60秒以内
- 30名 × 1ヶ月分（最大想定）

### 7.2 問題サイズ見積り

| 項目 | 概算 |
|---|---|
| `|D|` | 28〜31 |
| `|P|` | 5（デフォルト勤務パターン） |
| `|S|` | 10〜30 |
| 変数 `x[d,p,s]` の数 | 31 × 5 × 30 = 4,650 |
| 目的関数の補助変数（v6/v7/v8） | 数千 |

CP-SAT で十分扱える規模。

### 7.3 ソルバーパラメータ

```python
solver = cp_model.CpSolver()
solver.parameters.max_time_in_seconds = 30
solver.parameters.num_search_workers = 8
solver.parameters.log_search_progress = False
```

タイムアウト時の挙動は [5.1 ソルバーステータス別の判定](#51-ソルバーステータス別の判定) に従う：UNKNOWN かつ実行可能な中間解が見つかっていれば `success`（警告付き）として保存、見つかっていなければ `timeout_no_solution` として返す（`infeasible` とは区別し、緩和診断は実施しない）。

### 7.4 ウォームスタート（v8 段階での最適化）

v7 → v8 のように段階的に目的関数を追加する場合、前バージョンの解を `solver.SetHint()` で初期解として与えることで収束を早める。

---

## 8. 実装方針

### 8.1 モジュール構成

```
shift_generator/
├── api.py               # FastAPI エンドポイント、認可ガード
├── data_loader.py       # Supabase から入力取得
├── model_builder.py     # CP-SAT モデル構築
├── solver_runner.py     # 求解と結果抽出
├── evaluator.py         # 評価指標計算
├── reason_analyzer.py   # 失敗原因分析
├── persistence.py       # 結果のDB保存（shifts UPSERT + shift_assignments INSERT）
└── schemas.py           # Pydantic モデル
```

### 8.2 トランザクション

生成結果の保存は1トランザクションで、**初回生成と再生成のどちらでも同じフロー** で動くようにする。`shift_id` は SELECT または INSERT で必ず確定させてから `shift_assignments` の操作に進む。

```
BEGIN

-- 1. 初回生成を冪等に確保（UNIQUE制約で二重INSERTを防ぐ）
--    shifts テーブルに (target_year_month, store_id, department_id) の UNIQUE制約が必要。
--    SELECT ... FOR UPDATE だけでは行が存在しない段階で複数リクエストが同時に通過できてしまう。
INSERT INTO shifts (target_year_month, store_id, department_id, status)
  VALUES ($target_year_month, $store_id, $department_id, 'draft')
  ON CONFLICT (target_year_month, store_id, department_id) DO NOTHING
  RETURNING id
  → new_id or null

-- 2. INSERT が成功した場合（初回生成）
IF new_id IS NOT NULL:
    shift_id = new_id

-- 3. INSERT が競合した場合（既存行あり）→ 行ロックを取得してから判定
ELSE:
    SELECT id, status FROM shifts
      WHERE target_year_month = $target_year_month
        AND store_id = $store_id
        AND department_id = $department_id
      FOR UPDATE
    → existing

    IF overwrite_existing = false:
        ROLLBACK
        return 409 shift_already_exists (with existing.id)
    ELSE:
        shift_id = existing.id
        DELETE FROM shift_assignments WHERE shift_id = shift_id
        UPDATE shifts
          SET status = 'draft', updated_at = now()
          WHERE id = shift_id

-- 4. 生成結果を bulk INSERT
INSERT INTO shift_assignments (shift_id, target_date, work_pattern_id, staff_id, assignment_type)
  VALUES ... (bulk, assignment_type='auto')

COMMIT

return { shift_id, assignments_count, evaluation }
```

ポイント：

- `INSERT ... ON CONFLICT DO NOTHING` で初回生成の二重INSERTを防ぐ。既存行がある場合のみ `SELECT ... FOR UPDATE` で行ロックを取得する
- 再生成時は既存 `shift_id` を引き続き使い、`shift_assignments` の入れ替えで対応（履歴上は同一シフト）
- 公開済み (`status='published'`) のシフトを再生成する場合は `status='draft'` に戻し、再公開を manager に促す
- 失敗時は `ROLLBACK` し、レスポンスは API契約に従う（[5.1 ソルバーステータス別の判定](#51-ソルバーステータス別の判定) 参照）

### 8.3 ログ

| 項目 | 内容 |
|---|---|
| `request_id` | 全経路で伝播する一意ID |
| `solve_time_ms` | CP-SAT 求解時間 |
| `solver_status` | OPTIMAL / FEASIBLE / INFEASIBLE / UNKNOWN |
| `objective_value` | 解の目的関数値 |
| 違反数 | 各種ハード／ソフト制約違反数 |

個人情報（メール、氏名）はログに出さない。

### 8.4 エラーハンドリング

| 状況 | レスポンス |
|---|---|
| 入力データ不足（必要人数未設定など） | `400 validation_failed` |
| 既存シフト + `overwrite_existing=false` | `409 shift_already_exists` |
| 認可違反（FastAPI 認可ガード） | `403 forbidden` |
| ソルバータイムアウトかつ実行可能解なし | `200 timeout_no_solution`（緩和診断なし。タイムアウト旨を reasons に含める） |
| ソルバー異常終了 | `500 internal_error` |

### 8.5 テスト戦略

| レベル | 内容 |
|---|---|
| 単体 | 各モジュールの計算正しさ（評価指標、原因分析、モデル構築） |
| 結合 | 小規模シナリオ（5名 × 1週間）で全制約の挙動確認 |
| 性能 | 30名 × 1ヶ月で30秒以内 |
| シナリオ | 病欠多数 / 人員ぎりぎり / 人間関係多め / 雇用区分混在 など |

実DB相当のテスト用 fixture を `tests/fixtures/` に用意し、CI で再現可能にする。

---

## 9. 補足

### 9.1 設計上のトレードオフ

- **必要人数を等号制約 `=`** にしているため、超過割当（人数余り）は発生しない。代わりに不足時は infeasible になる
- **公平性は max−min の最小化**（線形化）で実装する。標準偏差直接最小化は CP-SAT では非効率
- **連勤回避ソフト制約 (C_pen)** はオプション。優先度が低いため `auto_generation_settings.enable_max_consecutive` が ON でも C_pen 重みは 0 にしておくのも可

### 9.2 将来拡張

- スタッフ単位の希望スコア（出たい / 出たくない）：ソフト制約として追加可
- 月またぎの連勤チェック：前月末の最終勤務日を入力に加えれば対応可
- 複数部門合同シフト：店舗単位での同時最適化を行う場合、決定変数を `(d, p, s, dept)` に拡張

# 実装タスクリスト

## Sprint 0：開発基盤・認証

- [x] モノレポ構成 (ルート `package.json` / Turborepo)
- [x] Next.js 14 App Router プロジェクト作成
- [x] FastAPI プロジェクト骨格作成 (`shift_generator/` ディレクトリ)
- [x] Supabase プロジェクト作成・環境変数設定
- [x] Supabase Auth メール認証実装（サインアップ・ログイン・ログアウト）
- [x] Next.js ミドルウェアでのロール判定（manager / staff）
- [x] ロール別ダッシュボードページ作成
- [x] Vercel (Next.js) / Render (FastAPI) デプロイ設定

## Sprint 1：スタッフ管理

- [x] `employees` / `work_patterns` テーブルマイグレーション作成
- [x] RLS ポリシー設定（`employees`）
- [x] スタッフ一覧画面 (UI + PostgREST SELECT)
- [x] スタッフ招待 (`inviteEmployee` Server Action + Supabase Auth `inviteUserByEmail`)
- [x] スタッフ編集画面 (`updateEmployee` Server Action)
- [x] スタッフ無効化 (`is_active=false`)
- [x] 勤務パターン一覧・設定UI (work_patterns CRUD)
- [x] スタッフへの勤務パターン割当・最大連勤日数設定

## Sprint 2：シフト条件設定

- [x] `shift_settings` / `required_staff_counts` / `auto_generation_settings` / `relationship_constraints` テーブルマイグレーション作成
- [x] RLS ポリシー設定
- [x] 希望休締切日・上限日数設定UI (shift_settings UPSERT)
- [x] 必要人数設定UI（平日/休日 × 勤務パターンマトリクス）
- [x] 自動生成条件設定UI（チェックボックス、auto_generation_settings UPSERT）
- [x] 人間関係制約設定UI（一覧・新規登録・有効/無効切替）

## Sprint 3：希望休入力

- [x] `day_off_requests` テーブルマイグレーション・RLS設定
- [x] 希望休入力UI（カレンダー、staff が対象年月を選択）
- [x] 希望休上限チェック・締切日チェック（クライアント or Server Action）
- [x] 入力済み希望休の表示

## Sprint 4：希望休一覧

- [x] 管理者向け希望休一覧画面（年月選択）
- [x] スタッフ別表示ビュー
- [x] 日付別表示ビュー

## Sprint 5：シフト一覧・手動編集

- [x] `shifts` テーブルマイグレーション作成（UNIQUE 制約: `(target_year_month, store_id, department_id)`、インデックス: `(store_id, department_id, target_year_month)`）
- [x] `shift_assignments` テーブルマイグレーション作成（UNIQUE 制約: `(shift_id, target_date, staff_id)`、インデックス: `(shift_id, target_date)`）
- [x] RLS ポリシー設定（`shifts` / `shift_assignments`）
- [x] `fn_assign_shift` RPC実装（楽観ロック付き）
- [x] `fn_remove_assignment` RPC実装
- [x] `fn_publish_shift` RPC実装
- [x] シフト一覧画面（日付 × 勤務パターンビュー）
- [x] スタッフ割当モーダル（候補者リスト・希望休警告アイコン）
- [x] 必要人数不足・超過バッジ表示
- [x] 読み取り専用モード / 編集モード切替
- [x] シフト公開・非公開切替UI

## Sprint 6：Excel出力

- [ ] SheetJS 導入
- [ ] 日付 × スタッフ グリッド生成ロジック
- [ ] ファイル名に対象年月を付与
- [ ] 権限別出力範囲制御（manager=全員、staff=自部門公開済みのみ）

## Sprint 7：自動生成 v0

- [ ] FastAPI モジュール骨格作成（`api.py` / `data_loader.py` / `model_builder.py` / `solver_runner.py` / `evaluator.py` / `reason_analyzer.py` / `persistence.py` / `schemas.py`）
- [ ] FastAPI の Supabase JWT 検証ミドルウェア実装（manager ロール確認）
- [ ] `POST /api/v1/shifts/generate` エンドポイント骨格実装（`overwrite_existing` / `solver_status` / `reasons[]` / `evaluation` を含むレスポンス契約）
- [ ] `data_loader.py`：Supabase から入力データ取得
- [ ] ランダム仮割当ロジック実装
- [ ] `persistence.py`：`INSERT ... ON CONFLICT DO NOTHING` + `SELECT ... FOR UPDATE` トランザクション実装
- [ ] `overwrite_existing=false` 時の 409 レスポンス実装
- [ ] Next.js から FastAPI 呼び出し（JWT転送）
- [ ] 生成結果の表示（シフト一覧画面へ反映）
- [ ] テスト：小規模シナリオ（5名 × 1週間）で v0 動作確認、`tests/fixtures/` 初期 fixture 作成

## Sprint 8：自動生成 v1 希望休遵守

- [ ] `data_loader.py` に希望休データ取得を追加
- [ ] H3制約実装（`enable_day_off_hard` フラグ分岐）
- [ ] テスト：希望休ありスタッフが割り当てられないことを fixture で確認

## Sprint 9：自動生成 v2 必要人数確保

- [ ] CP-SAT 導入（OR-Tools）または純粋 Python で H1 等号制約実装
- [ ] 候補数事前チェック実装（`reason_analyzer.py`）
- [ ] `staff_shortage` reason 生成
- [ ] `infeasible` レスポンス返却（`reasons[]` 含む）
- [ ] `timeout_no_solution` レスポンス返却（`INFEASIBLE` と区別）
- [ ] テスト：必要人数充足ケース・不足ケース（infeasible）の両方を fixture で確認

## Sprint 10：自動生成 v3 1日1シフト制限

- [ ] H2制約実装（`add_one_shift_per_day_constraint`、常時ON）
- [ ] テスト：同一スタッフが同日に複数割当されないことを確認

## Sprint 11：自動生成 v4 連勤制限

- [ ] CP-SAT 移行確定（v4以降）
- [ ] `y[d,s]` 派生変数定義
- [ ] H5制約実装（スライディングウィンドウ）
- [ ] H6制約実装（スタッフ別 `max_workdays_per_month`）
- [ ] 段階的緩和診断実装（`INFEASIBLE` 時のみ、`TIMEOUT_NO_SOLUTION` 時はスキップ）
- [ ] `consecutive_limit` reason 生成
- [ ] テスト：連勤制限が効くケース・制限が原因で infeasible になるケース

## Sprint 12：自動生成 v5 勤務パターン制約

- [ ] H4制約実装（フラグ ON 時：`wp[s]` のみ変数生成 / OFF 時：全パターン変数生成）
- [ ] `pattern_mismatch` reason 生成（フラグ ON 時のみ）
- [ ] テスト：フラグ ON/OFF で候補集合・割当結果が変わることを確認

## Sprint 13：自動生成 v6 人間関係soft制約

- [ ] `data_loader.py` に `relationship_constraints` 取得追加
- [ ] `R_pen` 補助変数 `z[d,p,s_a,s_b]` 実装
- [ ] 目的関数に α₃·R_pen 追加
- [ ] テスト：制約ペアが同日同パターンに入らないことを確認

## Sprint 14：自動生成 v7 土日公平性

- [ ] `weekend_work[s]` 変数定義
- [ ] `F_weekend`（max−min 線形化）実装
- [ ] 目的関数に α₁·F_weekend 追加
- [ ] テスト：雇用区分グループ内の土日出勤回数偏差が制約なしより小さくなることを確認

## Sprint 15：自動生成 v8 労働時間公平性

- [ ] `monthly_minutes[s]` 変数定義
- [ ] `F_minutes`（max−min 線形化）実装
- [ ] 目的関数に α₂·F_minutes 追加
- [ ] 性能テスト：30名 × 1ヶ月で30秒以内に収まることを確認

## Sprint 16：生成結果評価表示

- [ ] `evaluator.py` 各指標計算実装（違反数・スタッフ別指標・公平性指標）
- [ ] `POST /api/v1/shifts/generate` レスポンスの `evaluation` フィールド実装
- [ ] `GET /api/v1/shifts/{shift_id}/evaluate` エンドポイント実装
- [ ] 評価表示UI（生成結果モーダル or シフト一覧サイドパネル）
- [ ] テスト：各評価指標が正しく計算されることを単体テストで確認

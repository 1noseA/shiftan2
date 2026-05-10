# 実装タスクリスト

## Sprint 0：開発基盤・認証

- [ ] モノレポ構成 (ルート `package.json` / Turborepo)
- [ ] Next.js 14 App Router プロジェクト作成
- [ ] FastAPI プロジェクト骨格作成 (`shift_generator/` ディレクトリ)
- [ ] Supabase プロジェクト作成・環境変数設定
- [ ] Supabase Auth メール認証実装（サインアップ・ログイン・ログアウト）
- [ ] Next.js ミドルウェアでのロール判定（manager / staff）
- [ ] ロール別ダッシュボードページ作成
- [ ] Vercel (Next.js) / Render (FastAPI) デプロイ設定

## Sprint 1：スタッフ管理

- [ ] `employees` / `work_patterns` テーブルマイグレーション作成
- [ ] RLS ポリシー設定（`employees`）
- [ ] スタッフ一覧画面 (UI + PostgREST SELECT)
- [ ] スタッフ招待 (`inviteEmployee` Server Action + Supabase Auth `inviteUserByEmail`)
- [ ] スタッフ編集画面 (`updateEmployee` Server Action)
- [ ] スタッフ無効化 (`is_active=false`)
- [ ] 勤務パターン一覧・設定UI (work_patterns CRUD)
- [ ] スタッフへの勤務パターン割当・最大連勤日数設定

## Sprint 2：シフト条件設定

- [ ] `shift_settings` / `required_staff_counts` / `auto_generation_settings` / `relationship_constraints` テーブルマイグレーション作成
- [ ] RLS ポリシー設定
- [ ] 希望休締切日・上限日数設定UI (shift_settings UPSERT)
- [ ] 必要人数設定UI（平日/休日 × 勤務パターンマトリクス）
- [ ] 自動生成条件設定UI（チェックボックス、auto_generation_settings UPSERT）
- [ ] 人間関係制約設定UI（一覧・新規登録・有効/無効切替）

## Sprint 3：希望休入力

- [ ] `day_off_requests` テーブルマイグレーション・RLS設定
- [ ] 希望休入力UI（カレンダー、staff が対象年月を選択）
- [ ] 希望休上限チェック・締切日チェック（クライアント or Server Action）
- [ ] 入力済み希望休の表示

## Sprint 4：希望休一覧

- [ ] 管理者向け希望休一覧画面（年月選択）
- [ ] スタッフ別表示ビュー
- [ ] 日付別表示ビュー

## Sprint 5：シフト一覧・手動編集

- [ ] `shifts` / `shift_assignments` テーブルマイグレーション・RLS設定
- [ ] `fn_assign_shift` RPC実装（楽観ロック付き）
- [ ] `fn_remove_assignment` RPC実装
- [ ] `fn_publish_shift` RPC実装
- [ ] シフト一覧画面（日付 × 勤務パターンビュー）
- [ ] スタッフ割当モーダル（候補者リスト・希望休警告アイコン）
- [ ] 必要人数不足・超過バッジ表示
- [ ] 読み取り専用モード / 編集モード切替
- [ ] シフト公開・非公開切替UI

## Sprint 6：Excel出力

- [ ] SheetJS 導入
- [ ] 日付 × スタッフ グリッド生成ロジック
- [ ] ファイル名に対象年月を付与
- [ ] 権限別出力範囲制御（manager=全員、staff=自部門公開済みのみ）

## Sprint 7：自動生成 v0

- [ ] FastAPI モジュール骨格作成（`api.py` / `data_loader.py` / `model_builder.py` / `solver_runner.py` / `evaluator.py` / `reason_analyzer.py` / `persistence.py` / `schemas.py`）
- [ ] `POST /api/v1/shifts/generate` エンドポイント実装（認可ガード含む）
- [ ] `data_loader.py`：Supabase から入力データ取得
- [ ] ランダム仮割当ロジック実装
- [ ] `persistence.py`：`INSERT ... ON CONFLICT` トランザクション実装
- [ ] Next.js から FastAPI 呼び出し（JWT転送）
- [ ] 生成結果の表示（シフト一覧画面へ反映）

## Sprint 8：自動生成 v1 希望休遵守

- [ ] `data_loader.py` に希望休データ取得を追加
- [ ] H3制約実装（`enable_day_off_hard` フラグ分岐）

## Sprint 9：自動生成 v2 必要人数確保

- [ ] CP-SAT 導入（OR-Tools）または純粋 Python で H1 等号制約実装
- [ ] 候補数事前チェック実装（`reason_analyzer.py`）
- [ ] `staff_shortage` reason 生成
- [ ] infeasible レスポンス返却

## Sprint 10：自動生成 v3 1日1シフト制限

- [ ] H2制約実装（`add_one_shift_per_day_constraint`、常時ON）

## Sprint 11：自動生成 v4 連勤制限

- [ ] CP-SAT 移行確定（v4以降）
- [ ] `y[d,s]` 派生変数定義
- [ ] H5制約実装（スライディングウィンドウ）
- [ ] H6制約実装（スタッフ別 `max_workdays_per_month`）
- [ ] 段階的緩和診断実装（`INFEASIBLE` 時のみ）
- [ ] `consecutive_limit` reason 生成

## Sprint 12：自動生成 v5 勤務パターン制約

- [ ] H4制約実装（フラグ ON 時：`wp[s]` のみ変数生成 / OFF 時：全パターン変数生成）
- [ ] `pattern_mismatch` reason 生成（フラグ ON 時のみ）

## Sprint 13：自動生成 v6 人間関係soft制約

- [ ] `data_loader.py` に `relationship_constraints` 取得追加
- [ ] `R_pen` 補助変数 `z[d,p,s_a,s_b]` 実装
- [ ] 目的関数に α₃·R_pen 追加

## Sprint 14：自動生成 v7 土日公平性

- [ ] `weekend_work[s]` 変数定義
- [ ] `F_weekend`（max−min 線形化）実装
- [ ] 目的関数に α₁·F_weekend 追加

## Sprint 15：自動生成 v8 労働時間公平性

- [ ] `monthly_minutes[s]` 変数定義
- [ ] `F_minutes`（max−min 線形化）実装
- [ ] 目的関数に α₂·F_minutes 追加

## Sprint 16：生成結果評価表示

- [ ] `evaluator.py` 各指標計算実装（違反数・スタッフ別指標・公平性指標）
- [ ] API レスポンス `evaluation` フィールド追加
- [ ] 評価表示UI（生成結果モーダル or シフト一覧サイドパネル）

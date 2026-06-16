# Database Setup — Labelit Supabase

## Thứ tự chạy SQL

Từng file được đánh số thứ tự. **Chạy lần lượt theo đúng thứ tự** trong Supabase SQL Editor.

| # | File                | Mục đích                             |
|---|---------------------|--------------------------------------|
| 1 | `00_extensions.sql` | Bật pgcrypto                         |
| 2 | `01_helpers.sql`    | Hàm dùng chung (updated_at, RLS)     |
| 3 | `02_profiles.sql`   | Bảng profiles + auto-create khi auth |
| 4 | `03_core_tables.sql`| datasets, articles, paragraphs, annotations, audit logs |
| 5 | `04_label_options.sql` | label_options ontology              |
| 6 | `05_triggers.sql`   | Trigger updated_at, created_by, audit |
| 7 | `06_views.sql`      | View tiến độ bài báo và dataset      |
| 8 | `07_rls_policies.sql` | Row Level Security (quyền xem/sửa) |
| 9 | `08_seed_label_options.sql` | Seed ontology từ backend cũ    |

## Sau khi chạy

1. Vào Supabase **Authentication → Providers** bật Google OAuth.
2. Đăng nhập lần đầu để tạo profile row.
3. Vào Supabase **Table Editor** → `profiles` → bật `can_view` và `can_edit` cho user của bạn.
4. Copy `SUPABASE_URL` và `SUPABASE_ANON_KEY` vào `.env` bên frontend.

## Kiến trúc

- **Không backend** — frontend kết nối Supabase client trực tiếp.
- **Không cột scope** — đã loại bỏ khỏi annotations, label_options.
- **Audit log tự động** — trigger DB ghi log khi tạo/sửa/xóa annotation.
- **Import JSON** — frontend parse file JSON và insert vào DB.
- **Export JSON** — frontend query từ DB và xây lại format cũ (`total`, `articles`, `paragraphs`, `paragraph_annotations`).

## Lưu ý

- `annotation_audit_logs` chỉ được ghi bởi trigger, frontend **không** insert trực tiếp.
- Xóa annotation là soft-delete (set `is_deleted = true`), không xóa cứng.


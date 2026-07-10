-- V11: 전표 작성자를 users FK 로 정규화 (2/2 — 백필)
--
-- 기존 문자열 컬럼에는 두 종류의 값이 섞여 있다.
--   * username  : 'admin', 'manager'      (대부분의 created_by)
--   * name(성명): '시스템 관리자'          (work_posts.writer 등)
-- 따라서 username 과 name 양쪽으로 매칭한다.
--
-- 안전장치: 한 문자열이 두 명 이상의 사용자에게 매칭되면(동명이인, 또는 어떤 이의
-- username 이 다른 이의 name 과 같은 경우) 그 값은 백필하지 않고 NULL 로 남긴다.
-- 잘못 이어붙이느니 비워두고 사람이 판단하는 게 낫다.
--
-- 매칭 실패분(예: 'KHK', '검증')도 NULL 로 남는다. 실패 건수는 아래에서 NOTICE 로 출력한다.
-- users.name 에는 UNIQUE 제약이 없으므로 이 모호성 검사는 앞으로도 계속 필요하다.

DO $$
DECLARE
    r        record;
    updated  bigint;
    remain   bigint;
    total_up bigint := 0;
    total_rm bigint := 0;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('as_requests',        'created_by', 'created_by_id'),
            ('board_posts',        'author',     'author_id'),
            ('expenses',           'created_by', 'created_by_id'),
            ('notices',            'author',     'author_id'),
            ('production_plans',   'created_by', 'created_by_id'),
            ('productions',        'created_by', 'created_by_id'),
            ('projects',           'created_by', 'created_by_id'),
            ('purchases',          'created_by', 'created_by_id'),
            ('sales',              'created_by', 'created_by_id'),
            ('sales_orders',       'created_by', 'created_by_id'),
            ('schedule_events',    'created_by', 'created_by_id'),
            ('settlements',        'created_by', 'created_by_id'),
            ('shipments',          'created_by', 'created_by_id'),
            ('stock_lots',         'created_by', 'created_by_id'),
            ('stock_transactions', 'created_by', 'created_by_id'),
            ('stock_transfers',    'created_by', 'created_by_id'),
            ('surveys',            'created_by', 'created_by_id'),
            ('work_orders',        'created_by', 'created_by_id'),
            ('work_posts',         'writer',     'writer_id')
        ) AS x(tbl, src, dst)
    LOOP
        -- 모호하지 않은 (문자열 -> user.id) 매핑만 사용한다.
        EXECUTE format(
            'UPDATE public.%I t
                SET %I = m.id
               FROM (SELECT key, min(id) AS id
                       FROM (SELECT username AS key, id FROM public.users
                             UNION ALL
                             SELECT name     AS key, id FROM public.users) s
                      WHERE key IS NOT NULL AND btrim(key) <> %L
                      GROUP BY key
                     HAVING count(DISTINCT id) = 1) m
              WHERE btrim(t.%I) = m.key
                AND t.%I IS NULL',
            r.tbl, r.dst, '', r.src, r.dst);
        GET DIAGNOSTICS updated = ROW_COUNT;

        -- 문자열은 있는데 끝내 매칭 못 한 행
        EXECUTE format(
            'SELECT count(*) FROM public.%I
              WHERE %I IS NOT NULL AND btrim(%I) <> %L AND %I IS NULL',
            r.tbl, r.src, r.src, '', r.dst)
        INTO remain;

        total_up := total_up + updated;
        total_rm := total_rm + remain;

        IF remain > 0 THEN
            RAISE NOTICE '% : % 건 백필, % 건 매칭실패(NULL 유지)', r.tbl, updated, remain;
        ELSE
            RAISE NOTICE '% : % 건 백필', r.tbl, updated;
        END IF;
    END LOOP;

    RAISE NOTICE '=== 합계: % 건 백필, % 건 매칭실패 ===', total_up, total_rm;
END $$;

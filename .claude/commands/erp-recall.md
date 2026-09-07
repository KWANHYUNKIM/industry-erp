---
description: Notion [📋 ERP 작업 기록] 에서 지난 작업을 읽어 온다 (대화 새로 시작했을 때)
---

Notion 의 ERP 작업 기록을 조회해 **지금 이어서 해야 할 것**을 파악한다.

`notion-query-data-sources` (mode: sql), 데이터 소스 `collection://f5a413c2-6b78-4d3b-a73b-59b6f573ff73`.

기본 조회 — 최근 15건:
```sql
SELECT "제목", "date:날짜:start", "작업 유형", "모듈", "상태", "변경 내용", "관련 파일/커밋", "다음 할 일"
FROM "collection://f5a413c2-6b78-4d3b-a73b-59b6f573ff73"
ORDER BY "date:날짜:start" DESC, createdTime DESC LIMIT 15
```

안 끝난 것만:
```sql
... WHERE "상태" IN ('진행 중', '보류') ORDER BY "date:날짜:start" DESC
```

`$ARGUMENTS` 가 모듈명이면 `WHERE "모듈" LIKE '%<모듈>%'` 을 붙인다.

읽은 뒤에는 **전체를 그대로 붙여넣지 말고**, 이어서 할 일 위주로 5줄 안쪽으로 요약해 보고한다.
전문이 필요하면 그때 해당 행 URL 을 `notion-fetch` 한다.

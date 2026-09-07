---
description: 이번에 만든 것·고친 것을 Notion [📋 ERP 작업 기록] 에 한 줄 남긴다
---

Notion MCP 로 이 세션의 작업을 기록한다.

**대상 데이터 소스:** `collection://f5a413c2-6b78-4d3b-a73b-59b6f573ff73`
(부모 페이지: 제조 ERP 프로젝트 — https://app.notion.com/p/3ce8261100a9817484ebffb149860c33)

## 절차

1. `git log --date=short --pretty='%h|%ad|%s' -n 5` 와 `git status --short`, `git diff --stat` 으로
   **아직 기록하지 않은** 작업을 확인한다. 중복을 막으려면 먼저 최근 기록을 조회한다:
   `notion-query-data-sources` (sql) →
   `SELECT "제목","관련 파일/커밋" FROM "collection://f5a413c2-6b78-4d3b-a73b-59b6f573ff73" ORDER BY createdTime DESC LIMIT 15`
2. `notion-create-pages` 로 `parent: {type: "data_source_id", data_source_id: "f5a413c2-..."}` 에 행을 만든다.
   여러 건이면 한 번의 호출에 배열로 넣는다(호출당 4건 이하로 나눠야 JSON 이 잘리지 않는다).

## 컬럼

| 컬럼 | 넣는 값 |
|------|---------|
| `제목` | **무엇이 문제였는지**가 보이게. 커밋 제목을 그대로 써도 좋다 |
| `date:날짜:start` | `YYYY-MM-DD` |
| `작업 유형` | 기능 추가 / 수정개선 / 버그 수정 / 리팩토링 / 성능 / 스키마·마이그레이션 / 문서화 / 기타 중 하나 (정확한 문자열은 아래) |
| `모듈` | 배열. inventory·trade·production·accounting·quality·hr·groupware·settings·auth·common·frontend·qa |
| `상태` | 진행 중 / 완료 / 보류 |
| `변경 내용` | 무엇을 왜 바꿨는지 2~3줄 |
| `관련 파일/커밋` | 커밋 해시 + 핵심 파일. 미커밋이면 `(미커밋)` 을 앞에 |
| `검증` | 통과시킨 명령 (`compile`, `typecheck`, `qa.mjs`, `ui-check`, `dto-check`, `schema-check`) |
| `다음 할 일` | 이어서 할 것. 보류면 **왜 멈췄는지** |

`작업 유형` 정확한 선택지: `기능 추가`, `수정/개선`, `버그 수정`, `리팩토링`, `성능`, `스키마/마이그레이션`, `문서화`, `기타`

## 규칙

- 대화에 길게 늘어놓지 말고 **표에 남긴다.** 기록 후에는 한 줄로만 보고한다.
- 스키마를 건드린 작업은 `관련 파일/커밋` 에 본사(`db/migration/V*`)·테넌트(`db/tenant/V*`) 두 파일을 **둘 다** 적는다. 한쪽만 있으면 그 자체가 버그다.
- 아직 안 끝난 것은 지우지 말고 `보류` 로 남기고 이유를 적는다.

인자가 있으면(`$ARGUMENTS`) 그 내용을 기록 대상으로 삼고, 없으면 이 세션에서 한 작업 전부를 대상으로 한다.

---
name: next
description: 데이터이관 QA 를 멈춘 곳에서 바로 이어 한다 — 서버를 켜고 `_진행.md` 맨 위 '다시 시작할 곳' 의 남은 일을 순서대로 한다. `/next [이카운트 주소]`
---

# 이어 하기 (컴퓨터를 다시 켠 뒤 이것 하나만 치면 된다)

다시 조사하지 않는다. 아래 순서대로만 한다. 답은 한국말로.

1. **서버 켜기** (꺼져 있을 때만, 이미 떠 있으면 건드리지 않는다)
   - `docker ps` 에 `erp-postgres` 없으면 `docker compose up -d`
   - `curl -s localhost:8081/actuator/health` 안 되면 `cd backend && ./mvnw spring-boot:run` (백그라운드)
   - `curl -s localhost:5180` 안 되면 `cd frontend && npm run dev` (백그라운드, 포트 5180)
2. **메모리 확인** — PowerShell `Get-CimInstance Win32_OperatingSystem`. 95% 이상이면 코더를 띄우지 않고 사용자에게 알린다.
3. **할 일 읽기** — `.claude/skills/ecount-diff/plans/데이터이관/_진행.md` 맨 위 '다시 시작할 곳' 의 첫 줄(가장 최근 날짜)만 읽는다. 거기 적힌 '남은 일' ①부터 차례로 한다.
4. **방법** — `/migrate-qa` 스킬(`.claude/skills/migrate-qa/SKILL.md`)의 규칙 그대로:
   - 원본 주소는 인자, 없으면 `_접속.md`. 로그인 화면이 뜨면(세션 만료) 사용자에게 새 주소를 받는다.
   - 우리 앱 로그인: `_접속.md` 의 0005 관리자 계정으로 셸에서 POST /api/auth/login → scratchpad `inject.js` 로 localStorage `erp_token` · `erp_company` 를 넣는다(비밀번호를 채팅에 쓰지 않는다).
   - 회사 0005 자료는 화면으로만 넣는다(API · DB 쓰기 금지). 코더는 Opus 백그라운드, 백엔드 코더는 한 번에 하나, 커밋만.
   - 묶음 U 코더 지시문: `plans/데이터이관/묶음U-담당자와-관리사원-분리.md`. 시작 전에 `bash qa/db-dump.sh`.
5. **한 가지 끝날 때마다** `_진행.md` 에 루프 한 줄 · '다시 시작할 곳' 갱신 → 커밋 → 푸시(메모리 github-push-account 의 KWANHYUNKIM 토큰 방식). 사용자에게 한두 줄 보고하고 다음 일로.
6. 멈출 때 '다시 시작할 곳' 맨 위에 날짜 · 남은 일을 다시 적는다 — 다음에도 `/next` 하나로 이어지게.

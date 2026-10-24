---
name: finish
description: 이카운트 똑같이 만들기 마무리를 이어 돌린다 — 진행 원칙(원본과 동일 · 주간 20~30% 토큰 · 빠르게)대로 작업자를 띄우고, 끝날 때마다 다음 묶음을 넣는다. `/finish [이카운트 주소]`
---

1. `.claude/skills/ecount-diff/plans/진행-원칙.md` 를 읽고 그대로 따른다(짧다). 사용자가 같은 지시를 다시 하지 않게 하는 파일이다.
2. 상태 확인(한 번에): `curl` 로 8081 · 5180 응답, `docker ps`, `git status --short | head`, `git log --oneline -8`.
   꺼져 있으면 켠다 — Docker Desktop(`open -a Docker`) → `docker compose up -d` → `bash qa/restart-backend.sh 진행자 > /tmp/진행자-restart.out 2>&1`(파이프 금지) → `cd frontend && nohup npm run dev -- --port 5180 > /tmp/erp-frontend.log 2>&1 &`.
3. 원본 주소: 인자로 받은 주소, 없으면 `plans/재개.md` 맨 위의 주소. Chrome 도구가 없으면(`tabs_context_mcp` 없음) 사용자에게 `claude --chrome --continue` 로 다시 시작해 달라고 한 줄로 말한다.
   로그인 유지 탭(제목 '(주)가장많이쓰는ERP')을 하나 열어 두고, 작업자에게 그 탭은 건드리지 말라고 지시문에 적는다.
4. 다음 차례 고르기: `plans/재개.md` 맨 위 절의 '다음 차례' · `plans/마무리-묶음.md` 맨 앞 칸(빈칸 = 안 함, ◐ = 원본 재기 남음) · `plans/완료.md`. 사용자 결정 대기 항목은 건너뛴다.
5. 작업자 띄우기(진행-원칙 '속도'): 원본 1 + 코드 3, 백그라운드. 지시문은 `plans/작업자-요약.md` 를 따르라는 말 + 할 일 · 줄 번호 · 확인 방법 · 보고 형식.
6. 작업자가 끝나면 사용자에게 2~3줄 보고 → `plans/` 기록 커밋 · 푸시 → 바로 다음 묶음을 넣는다. 멈출 때는 `plans/재개.md` 맨 위에 '다시 시작할 곳' 절을 새로 쓴다.

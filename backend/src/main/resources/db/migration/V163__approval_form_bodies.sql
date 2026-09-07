-- 기안서 양식 본문이 비어 있던 넷을 원본대로 채운다.
--
-- 사본 21장(기안서작성을 양식마다 하나씩 열어 둔 것)을 실측했다. 양식 이름 20개는 이미
-- 맞았지만 **본문 서식(field_schema)이 통째로 빈 양식이 넷** 있었다 — 기술문서 ·
-- 내부일반문서 · 급여 지급결의서 · 인사발령공고. 고르면 제목과 자유본문만 나오고
-- 양식이 아무 구실을 안 했다. 결재는 도는데 무엇을 결재하는지가 문서에 없는 상태였다.
--
-- 급여 지급결의서와 인사발령공고는 원본이 표를 쓴다. 표의 행은 매달 같은 목록이라
-- defaultRows 로 미리 깔아 둔다(이미 지원한다 — 여비산정이 그렇게 돼 있다).
-- 손으로 열두 줄씩 적게 하는 것이 원본이 없애 주는 바로 그 수고다.
--
-- 개인경비 사용내역서는 표 열이 셋(일자·용도·금액)뿐이었는데 원본은 일곱이다.
-- **기존 키(useDate·purpose·amount)는 그대로 두고** 라벨만 원본에 맞추고 열을 더한다.
-- 키를 갈면 이미 올라간 기안서의 값이 갈 곳을 잃는다.

UPDATE approval_form_templates SET field_schema = '[
  {"key":"effectiveDate","type":"date","label":"시행일자","required":true},
  {"key":"coopDept","type":"text","label":"협조부서"},
  {"key":"agreement","type":"text","label":"합의"}
]'::jsonb WHERE name = '기술문서';

-- 원본에는 기안자·기안 시점 칸도 있으나 넣지 않는다. 전표가 이미 아는 값이라
-- 칸을 두면 사람이 적은 값과 실제 기안자가 어긋날 수 있다.
UPDATE approval_form_templates SET field_schema = '[
  {"key":"effectiveDate","type":"date","label":"시행 일자","required":true},
  {"key":"workStartedAt","type":"date","label":"업무 발생 시점"},
  {"key":"workFinishedAt","type":"date","label":"업무 완료 시점"}
]'::jsonb WHERE name = '내부일반문서';

UPDATE approval_form_templates SET field_schema = '[
  {"key":"payMonth","type":"text","label":"근무 월","required":true},
  {"key":"payDate","type":"date","label":"지급예정일","required":true},
  {"key":"headcount","type":"number","label":"지급인원(명)"},
  {"key":"payAmount","type":"number","label":"지급금액(원)"},
  {"key":"payDetail","type":"table","label":"지급상세",
   "columns":[{"key":"kind","type":"text","label":"항목명"},
              {"key":"taxable","type":"number","label":"과세금액"},
              {"key":"nonTaxable","type":"number","label":"비과세금액"}],
   "defaultRows":[{"kind":"기본급"},{"kind":"상여금"},{"kind":"야간근로수당"},
                  {"kind":"연장근로수당"},{"kind":"연차수당"},{"kind":"휴일근로수당"},
                  {"kind":"명절·휴가수당"},{"kind":"식비보조"},{"kind":"차량 비과세"},
                  {"kind":"보육수당"}],
   "totalOf":"taxable","totalLabel":"과세 소계"},
  {"key":"deductDetail","type":"table","label":"공제상세",
   "columns":[{"key":"kind","type":"text","label":"항목명"},
              {"key":"amount","type":"number","label":"금액"}],
   "defaultRows":[{"kind":"건강보험"},{"kind":"고용보험"},{"kind":"국민연금"},
                  {"kind":"근로소득세"},{"kind":"근로지방소득세"},{"kind":"농특세"},
                  {"kind":"연말정산소득세"},{"kind":"연말정산지방소득세"},
                  {"kind":"장기요양보험"},{"kind":"정산농특세"},{"kind":"학자금상환"},
                  {"kind":"과학기술인공제회"}],
   "totalOf":"amount","totalLabel":"공제 합계"}
]'::jsonb WHERE name = '급여 지급결의서';

UPDATE approval_form_templates SET field_schema = '[
  {"key":"effectiveDate","type":"date","label":"발령일자","required":true},
  {"key":"kind","type":"text","label":"발령내용"},
  {"key":"targets","type":"table","label":"발령자",
   "columns":[{"key":"empNo","type":"text","label":"사번"},
              {"key":"name","type":"text","label":"성명"},
              {"key":"kindName","type":"text","label":"발령구분명"},
              {"key":"fromRank","type":"text","label":"이전 직위/직급"},
              {"key":"toRank","type":"text","label":"발령 직위/직급"},
              {"key":"fromDept","type":"text","label":"이전 부서"},
              {"key":"toDept","type":"text","label":"발령 부서"}]}
]'::jsonb WHERE name = '인사발령공고';

UPDATE approval_form_templates SET field_schema = '[
  {"key":"items","type":"table","label":"사용내역",
   "columns":[{"key":"cardNo","type":"text","label":"카드번호"},
              {"key":"useDate","type":"date","label":"사용날짜"},
              {"key":"useTime","type":"text","label":"시간"},
              {"key":"vendor","type":"text","label":"사용처(전표상 상호)"},
              {"key":"purpose","type":"text","label":"사용내역(상세하게 기재)"},
              {"key":"amount","type":"number","label":"사용금액"},
              {"key":"note","type":"text","label":"비고"}],
   "totalOf":"amount","totalLabel":"합계"}
]'::jsonb WHERE name = '개인경비 사용내역서';

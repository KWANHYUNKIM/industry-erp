-- V343(테넌트 V216)에서 생긴 회계전표 줄 [부서] · [프로젝트]를 이미 있는 전표에 채운다:
-- 현금거래 한 장 입력(fast_vouchers)과 어음 수취/발행 분개(source_type NOTE)는 머리의 부서 · 프로젝트가 모든 줄로 간다.

UPDATE journal_lines l
   SET department_id = v.department_id, project_id = v.project_id
  FROM fast_vouchers v
 WHERE v.journal_entry_id = l.entry_id
   AND (v.department_id IS NOT NULL OR v.project_id IS NOT NULL);

UPDATE journal_lines l
   SET department_id = n.department_id, project_id = n.project_id
  FROM journal_entries e
  JOIN promissory_notes n ON e.source_type = 'NOTE' AND e.source_id = n.id
 WHERE e.id = l.entry_id
   AND (n.department_id IS NOT NULL OR n.project_id IS NOT NULL);

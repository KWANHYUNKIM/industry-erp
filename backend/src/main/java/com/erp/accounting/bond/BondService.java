package com.erp.accounting.bond;

import com.erp.accounting.account.AccountService;
import com.erp.accounting.bond.dto.BondDtos.BondEntryResponse;
import com.erp.accounting.bond.dto.BondDtos.CreateBondRequest;
import com.erp.accounting.bond.dto.BondDtos.LineRequest;
import com.erp.accounting.bond.dto.BondDtos.UpdateBondRequest;
import com.erp.common.ApiException;
import com.erp.inventory.project.ProjectService;
import com.erp.trade.partner.PartnerService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 회계 II &gt; 채권관리 · 채무관리 — 채권(채무)내역 보조장부.
 *
 * <p>원본(2026-10-12 loginaa 실측)에서 확인한 규칙:
 * <ul>
 *   <li>[채권번호]는 줄마다 필수다 — 비우고 저장하면 그 칸에 '유효키항목 필수입력'. [Fn ▸ 코드생성]이 번호를 만들어 준다.</li>
 *   <li>[일자-No.] 의 No. 는 같은 날 몇 번째 장인지다(2026/10/12 -1, -2).</li>
 *   <li>증가 장을 지워도 그 번호로 감소한 장이 남아 있으면 막지 않는다(선택삭제가 그대로 지웠다).</li>
 *   <li>저장해도 회계전표는 생기지 않는다([회계일자-No.] 빈칸 · 출처업무 '채권내역').</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class BondService {

    private final BondEntryRepository entryRepository;
    private final AccountService accountService;
    private final PartnerService partnerService;
    private final ProjectService projectService;

    /** 기준일 끝까지의 모든 장 — 조회는 기간으로, 거래내역 · 현황은 이월잔액까지 화면이 다시 센다. */
    @Transactional(readOnly = true)
    public List<BondEntryResponse> findUpTo(BondSide side, LocalDate to) {
        return entryRepository.findUpTo(side, to != null ? to : LocalDate.of(9999, 12, 31))
                .stream().map(BondEntryResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public BondEntryResponse get(Long id) {
        return BondEntryResponse.from(load(id));
    }

    @Transactional
    public BondEntryResponse create(CreateBondRequest req, String username) {
        int no = entryRepository.maxEntryNo(req.side(), req.entryDate()) + 1;
        BondEntry e = BondEntry.builder()
                .side(req.side()).entryDate(req.entryDate()).entryNo(no)
                .direction(req.direction()).createdBy(username).updatedBy(username)
                .build();
        e.replaceLines(toLines(req.lines(), req.direction()));
        return BondEntryResponse.from(entryRepository.save(e));
    }

    @Transactional
    public BondEntryResponse update(Long id, UpdateBondRequest req, String username) {
        BondEntry e = load(id);
        e.replaceLines(toLines(req.lines(), e.getDirection()));
        e.setUpdatedBy(username);
        return BondEntryResponse.from(e);
    }

    @Transactional
    public void delete(List<Long> ids) {
        for (Long id : ids) entryRepository.delete(load(id));
    }

    private BondEntry load(Long id) {
        return entryRepository.findWithLines(id)
                .orElseThrow(() -> ApiException.notFound("전표를 찾을 수 없습니다. id=" + id));
    }

    private List<BondLine> toLines(List<LineRequest> reqs, BondDirection direction) {
        List<BondLine> out = new ArrayList<>();
        for (LineRequest r : reqs) {
            if (r.bondNo() == null || r.bondNo().isBlank()) {
                throw ApiException.badRequest("채권번호 : 유효키항목 필수입력");
            }
            if (r.amount().compareTo(BigDecimal.ZERO) == 0) {
                throw ApiException.badRequest("금액 : 필수입력");
            }
            out.add(BondLine.builder()
                    .account(accountService.getUsable(r.accountId()))
                    .partner(r.partnerId() != null ? partnerService.get(r.partnerId()) : null)
                    .bondNo(r.bondNo().trim())
                    .amount(r.amount())
                    .dueDate(direction == BondDirection.INCREASE ? r.dueDate() : null)
                    .departmentId(r.departmentId())
                    .project(r.projectId() != null ? projectService.get(r.projectId()) : null)
                    .memo(r.memo())
                    .build());
        }
        return out;
    }
}

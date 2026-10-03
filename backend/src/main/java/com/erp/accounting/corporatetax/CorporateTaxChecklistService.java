package com.erp.accounting.corporatetax;

import com.erp.accounting.corporatetax.dto.CorporateTaxChecklistDtos.ChecklistResponse;
import com.erp.accounting.corporatetax.dto.CorporateTaxChecklistDtos.MemoRequest;
import com.erp.accounting.corporatetax.dto.CorporateTaxChecklistDtos.MemoResponse;
import com.erp.accounting.corporatetax.dto.CorporateTaxChecklistDtos.PayrollMonth;
import com.erp.accounting.corporatetax.dto.CorporateTaxChecklistDtos.SalesMonth;
import com.erp.accounting.journal.JournalQueryService;
import com.erp.accounting.withholding.WithholdingService;
import com.erp.accounting.withholding.dto.WithholdingDtos.PayrollTaxMonth;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/** 법인세Checklist(E030401) — 기준연도의 매출계정 · 급여/원천세를 모아 보이고, 항목마다 메모를 단다. */
@Service
@RequiredArgsConstructor
public class CorporateTaxChecklistService {

    /** 원본 항목 번호 1 ~ 15. */
    private static final int LAST_SECTION = 15;

    private final JournalQueryService journalQueryService;
    private final WithholdingService withholdingService;
    private final CorporateTaxCheckMemoRepository memoRepository;

    @Transactional(readOnly = true)
    public ChecklistResponse checklist(int year) {
        List<BigDecimal> monthly = journalQueryService.monthlySales(year);
        List<SalesMonth> sales = new ArrayList<>();
        BigDecimal cumulative = BigDecimal.ZERO;
        for (int m = 1; m <= 12; m++) {
            BigDecimal amount = monthly.get(m - 1);
            cumulative = cumulative.add(amount);
            boolean quarterEnd = m % 3 == 0;
            BigDecimal quarter = quarterEnd ? monthly.get(m - 3).add(monthly.get(m - 2)).add(amount) : null;
            sales.add(new SalesMonth(m, amount, quarter, quarterEnd ? cumulative : null,
                    m % 6 == 0 ? cumulative : null, m == 12 ? cumulative : null));
        }
        List<PayrollMonth> payroll = new ArrayList<>();
        for (PayrollTaxMonth p : withholdingService.payrollTaxMonths(year)) {
            payroll.add(new PayrollMonth(Integer.parseInt(p.month().substring(5)), p.reported(),
                    p.reported().subtract(p.salary()), p.salary(), p.bonus(), p.incomeTax(), p.localIncomeTax(),
                    p.pension(), p.health(), p.employment()));
        }
        return new ChecklistResponse(year, sales, payroll);
    }

    @Transactional(readOnly = true)
    public List<MemoResponse> memos(int year, int section) {
        return memoRepository.findByBaseYearAndSectionNoOrderByMemoDateDescIdDesc(year, section).stream()
                .map(CorporateTaxChecklistService::toResponse).toList();
    }

    @Transactional
    public MemoResponse createMemo(MemoRequest req, String writer) {
        checkSection(req.section());
        CorporateTaxCheckMemo memo = CorporateTaxCheckMemo.builder()
                .baseYear(req.year()).sectionNo(req.section())
                .memoDate(req.memoDate()).title(req.title().trim()).content(req.content())
                .writer(writer)
                .build();
        return toResponse(memoRepository.save(memo));
    }

    @Transactional
    public MemoResponse updateMemo(Long id, MemoRequest req) {
        CorporateTaxCheckMemo memo = find(id);
        memo.setMemoDate(req.memoDate());
        memo.setTitle(req.title().trim());
        memo.setContent(req.content());
        return toResponse(memo);
    }

    @Transactional
    public void deleteMemo(Long id) {
        memoRepository.delete(find(id));
    }

    private CorporateTaxCheckMemo find(Long id) {
        return memoRepository.findById(id).orElseThrow(() -> ApiException.notFound("메모를 찾을 수 없습니다: " + id));
    }

    private static void checkSection(int section) {
        if (section < 1 || section > LAST_SECTION) {
            throw ApiException.badRequest("항목 번호가 올바르지 않습니다: " + section);
        }
    }

    private static MemoResponse toResponse(CorporateTaxCheckMemo m) {
        return new MemoResponse(m.getId(), m.getBaseYear(), m.getSectionNo(), m.getMemoDate(),
                m.getTitle(), m.getContent(), m.getWriter());
    }
}

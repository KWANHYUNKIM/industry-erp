package com.erp.accounting.contractbill;

import com.erp.accounting.billingcontract.BillingContractLine;
import com.erp.accounting.billingcontract.BillingContractService;
import com.erp.accounting.contractbill.dto.ContractBillDtos.BillLine;
import com.erp.accounting.contractbill.dto.ContractBillDtos.BillLineView;
import com.erp.accounting.contractbill.dto.ContractBillDtos.InvoiceRow;
import com.erp.accounting.contractbill.dto.ContractBillDtos.ReflectRequest;
import com.erp.accounting.journal.JournalEntry;
import com.erp.accounting.journal.JournalEntryRepository;
import com.erp.accounting.journal.JournalLine;
import com.erp.accounting.journal.JournalService;
import com.erp.accounting.journal.dto.JournalDtos.VatSlipRequest;
import com.erp.accounting.contractbill.dto.ContractBillDtos.BillResponse;
import com.erp.accounting.contractbill.dto.ContractBillDtos.CreateBillRequest;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 회계 II › 계약관리 › 청구예정자료생성(E060905) — 2026-10-13 loginaa 실측.
 *
 * <p>[신규] → 청구자료생성 창(일자 · 부가세유형 · 청구단위) → [계약] 으로 계약현황을 찾아 줄을 불러와 [일괄생성](한 장) ·
 * [거래처별생성](거래처마다 한 장). 같은 달을 다시 생성해도 막지 않는다(원본 -1 · -2 둘 다 생김).
 * 번호를 누르면 청구자료수정 창(저장 · 닫기 · 삭제) — 삭제 확인 '전표를 삭제하겠습니까?'.
 * 회계반영 · 판매생성이 끝난 자료는 고치거나 지울 수 없게 막는다.
 *
 * <p><b>회계/판매일괄반영</b>(E060906) — 2026-10-13 실측: 구분 회계반영 · 청구자료생성일자로 찾으면 거래처별 한 줄
 * (거래가액 · 조정 · 외화금액 · 환율 · 공급가액 · 부가세 · 합계 · 매출계정 · 상세 · 적요 · 회계전표No.).
 * 골라 [매출전표 I] → 창(전표일자 · 부서 · 프로젝트 · 부가세유형 · 거래처 · 공급가액 20,000 · 부가세 2,000 · 적요 'QA회계2-월사용료' ·
 * 매출계정 4049 제품매출 · 입금계좌 1089 외상매출금) [저장] → 매출전표 I 한 장, 그 거래처 줄은 목록에서 빠진다.
 * 매출(세금)계산서현황(계약)에 '2026/10/13 -6 · (사)경남주류협회 · 20,000 · 2,000 · 22,000' 으로 나온다.
 * 그 전표를 열어 [삭제]('전표를 삭제하겠습니까? - 매출')하면 청구예정자료의 회계반영여부가 다시 빈칸이다.
 */
@Service
@RequiredArgsConstructor
public class ContractBillService {

    private final ContractBillRepository repository;
    private final BillingContractService contractService;
    private final JournalService journalService;
    /** 같은 모듈(accounting) — 반영한 전표를 읽기만 한다. */
    private final JournalEntryRepository journalRepository;

    @Transactional(readOnly = true)
    public List<BillResponse> findAll(LocalDate from, LocalDate to) {
        List<ContractBill> bills = repository.findInPeriod(
                from != null ? from : LocalDate.of(1900, 1, 1), to != null ? to : LocalDate.of(9999, 12, 31));
        return withLines(bills);
    }

    @Transactional(readOnly = true)
    public BillResponse findOne(Long id) {
        return withLines(List.of(get(id))).get(0);
    }

    @Transactional
    public List<BillResponse> create(CreateBillRequest req, String username) {
        Map<Long, BillingContractLine> cls = contractLines(req.lines());
        Map<Long, List<BillLine>> groups = new LinkedHashMap<>();
        for (BillLine l : req.lines()) {
            Long key = req.byPartner() ? cls.get(l.contractLineId()).getContract().getPartner().getId() : 0L;
            groups.computeIfAbsent(key, (k) -> new ArrayList<>()).add(l);
        }
        List<Long> ids = new ArrayList<>();
        int no = repository.maxDocNo(req.billDate());
        for (List<BillLine> g : groups.values()) {
            ContractBill b = ContractBill.builder().billDate(req.billDate()).docNo(++no).vatType(req.vatType()).createdBy(username).build();
            fill(b, g, cls);
            ids.add(repository.save(b).getId());
        }
        return withLines(repository.findAllById(ids));
    }

    @Transactional
    public BillResponse update(Long id, List<BillLine> lines) {
        ContractBill b = get(id);
        requireOpen(b);
        b.getLines().clear();
        repository.flush();
        fill(b, lines, contractLines(lines));
        return findOne(id);
    }

    @Transactional
    public void delete(List<Long> ids) {
        for (Long id : ids) {
            ContractBill b = get(id);
            requireOpen(b);
            repository.delete(b);
        }
    }

    /** 회계/판매일괄반영 · 회계미반영현황(계약) — 청구자료생성일자 안의 줄 전부. reflected=false 면 아직 반영 안 된 줄만. */
    @Transactional(readOnly = true)
    public List<BillLineView> lines(LocalDate from, LocalDate to, Boolean reflected) {
        return repository.findLinesInPeriod(from != null ? from : LocalDate.of(1900, 1, 1), to != null ? to : LocalDate.of(9999, 12, 31))
                .stream()
                .filter((l) -> reflected == null || reflected == (l.getJournalEntryId() != null))
                .map(BillLineView::from).toList();
    }

    /**
     * [매출전표 I] 창 [저장] — 고른 줄을 매출전표 I 한 장으로 만들고 줄마다 그 전표를 단다.
     * 분개는 매출전표 I 와 같다: 차) 입금계좌(외상매출금) 합계 / 대) 매출계정(제품매출) 공급가액 · 부가세예수금 부가세.
     */
    @Transactional
    public Long reflect(ReflectRequest req, String username) {
        List<ContractBillLine> ls = repository.findLinesByIds(req.lineIds());
        if (ls.size() != req.lineIds().stream().distinct().count()) throw ApiException.notFound("청구자료를 찾을 수 없습니다.");
        for (ContractBillLine l : ls) {
            if (l.getJournalEntryId() != null) {
                throw ApiException.badRequest("이미 회계반영된 청구자료입니다: " + l.getBill().getBillDate() + " -" + l.getBill().getDocNo());
            }
            if (!l.getContractLine().getContract().getPartner().getId().equals(req.partnerId())) {
                throw ApiException.badRequest("거래처가 다른 청구자료는 한 전표로 반영할 수 없습니다.");
            }
        }
        if (req.supplyAmount().signum() <= 0) throw ApiException.badRequest("공급가액은 0보다 커야 합니다.");
        String desc = req.description() != null && !req.description().isBlank() ? req.description().trim()
                : ls.get(0).getContractLine().getItem().getName();
        JournalEntry je = journalService.createVatSlip(new VatSlipRequest(true, req.entryDate(), req.departmentId(), req.projectId(),
                req.vatType(), req.partnerId(), req.supplyAmount(), req.vatAmount() != null ? req.vatAmount() : BigDecimal.ZERO, desc,
                req.accountId(), req.settleAccountId(), null, req.eInvoiceKind(), req.vatOmitted(), null), username);
        for (ContractBillLine l : ls) l.setJournalEntryId(je.getId());
        return je.getId();
    }

    /**
     * 매출(세금)계산서현황(계약) — 반영으로 만든 매출전표 I 를 기준일자(전표일자)로. 공급가액 = 합계 − 부가세(부가세예수금 255 대변).
     */
    @Transactional(readOnly = true)
    public List<InvoiceRow> invoices(LocalDate from, LocalDate to) {
        Map<Long, List<ContractBillLine>> byJournal = repository.findReflectedLines().stream()
                .collect(Collectors.groupingBy(ContractBillLine::getJournalEntryId, LinkedHashMap::new, Collectors.toList()));
        if (byJournal.isEmpty()) return List.of();
        List<InvoiceRow> out = new ArrayList<>();
        for (JournalEntry e : journalRepository.findAllById(byJournal.keySet())) {
            if (from != null && e.getEntryDate().isBefore(from)) continue;
            if (to != null && e.getEntryDate().isAfter(to)) continue;
            BigDecimal total = e.totalDebit();
            BigDecimal vat = e.getLines().stream().filter((l) -> "255".equals(l.getAccount().getCode()))
                    .map(JournalLine::getCredit).reduce(BigDecimal.ZERO, BigDecimal::add);
            JournalLine first = e.getLines().isEmpty() ? null : e.getLines().get(0);
            out.add(new InvoiceRow(e.getId(), e.getEntryDate(), entryNo(e.getDocNo()), e.getDocNo(),
                    e.getPartner() != null ? e.getPartner().getId() : null, e.getPartner() != null ? e.getPartner().getName() : null,
                    first != null ? first.getDepartmentId() : null, first != null ? first.getProjectId() : null,
                    e.getVatType(), e.getConfirmStatus() != null ? e.getConfirmStatus().name() : null,
                    total.subtract(vat), vat, total,
                    byJournal.get(e.getId()).stream().map((l) -> l.getBill().getId()).distinct().toList()));
        }
        out.sort((a, b) -> a.entryDate().equals(b.entryDate()) ? Integer.compare(nz(a.entryNo()), nz(b.entryNo())) : a.entryDate().compareTo(b.entryDate()));
        return out;
    }

    private static int nz(Integer v) { return v != null ? v : 0; }

    /** 'JE-20261013-0006' → 6 (회계거래조회의 '26/10/13-6'). */
    private static Integer entryNo(String docNo) {
        if (docNo == null) return null;
        int dash = docNo.lastIndexOf('-');
        try { return Integer.valueOf(docNo.substring(dash + 1)); } catch (NumberFormatException ex) { return null; }
    }

    private static void requireOpen(ContractBill b) {
        if (b.getLines().stream().anyMatch((l) -> l.getJournalEntryId() != null) || b.isSalesCreated()) {
            throw ApiException.badRequest("회계반영 · 판매생성된 청구자료는 고치거나 지울 수 없습니다.");
        }
    }

    private Map<Long, BillingContractLine> contractLines(List<BillLine> lines) {
        List<Long> ids = lines.stream().map(BillLine::contractLineId).distinct().toList();
        Map<Long, BillingContractLine> m = contractService.lines(ids).stream()
                .collect(Collectors.toMap(BillingContractLine::getId, Function.identity()));
        for (Long id : ids) if (!m.containsKey(id)) throw ApiException.notFound("계약 줄을 찾을 수 없습니다. id=" + id);
        return m;
    }

    private static void fill(ContractBill b, List<BillLine> lines, Map<Long, BillingContractLine> cls) {
        int no = 1;
        for (BillLine l : lines) {
            BillingContractLine cl = cls.get(l.contractLineId());
            b.getLines().add(ContractBillLine.builder().bill(b).lineNo(no++).contractLine(cl).billMonth(l.billMonth())
                    .quantity(or(l.quantity(), cl.getQuantity())).unitPrice(or(l.unitPrice(), cl.getUnitPrice()))
                    .supplyAmount(or(l.supplyAmount(), cl.getSupplyAmount())).vatAmount(or(l.vatAmount(), cl.getVatAmount()))
                    .remark(l.remark()).build());
        }
    }

    private static BigDecimal or(BigDecimal v, BigDecimal d) {
        return v != null ? v : d;
    }

    private ContractBill get(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("청구자료를 찾을 수 없습니다. id=" + id));
    }

    private List<BillResponse> withLines(List<ContractBill> bills) {
        if (bills.isEmpty()) return List.of();
        Map<Long, List<ContractBillLine>> by = repository.findLinesOf(bills.stream().map(ContractBill::getId).toList())
                .stream().collect(Collectors.groupingBy((l) -> l.getBill().getId()));
        return bills.stream()
                .sorted((a, c) -> a.getBillDate().equals(c.getBillDate()) ? c.getDocNo() - a.getDocNo() : c.getBillDate().compareTo(a.getBillDate()))
                .map((b) -> BillResponse.from(b, by.getOrDefault(b.getId(), List.of()))).toList();
    }
}

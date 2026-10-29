package com.erp.accounting.contractbill;

import com.erp.accounting.StandardAccounts;
import com.erp.accounting.billingcontract.BillingContractLine;
import com.erp.accounting.billingcontract.BillingContractService;
import com.erp.accounting.contractbill.dto.ContractBillDtos;
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
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.sales.SalesService;
import com.erp.trade.sales.dto.SalesDtos;
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
    private final DocumentNoGenerator docNoGenerator;
    private final BillingContractService contractService;
    private final JournalService journalService;
    /** accounting → trade (CLAUDE.md 4.1 허용) — 판매반영은 판매를 trade 의 규칙(재고 · 번호)대로 만든다. */
    private final SalesService salesService;
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
        for (List<BillLine> g : groups.values()) {
            ContractBill b = ContractBill.builder().billDate(req.billDate()).docNo(docNoGenerator.nextSeq("contract_bills", req.billDate(), repository.maxDocNo(req.billDate()))).vatType(req.vatType()).createdBy(username).build();
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

    /**
     * [선택삭제] · 청구자료수정 [삭제]. 회계반영된 자료(반영 전표를 회계 쪽에서 지웠어도 [회계전표삭제] 전까지)는 원본 문구로 막는다
     * (2026-10-21 실측: '선택한 청구리스트 중 일부는 삭제가 불가능합니다. … [삭제가 불가능한 청구리스트] 1. 일괄반영한 내역 2026/10/21 -1').
     */
    @Transactional
    public void delete(List<Long> ids) {
        List<ContractBill> bills = ids.stream().map(this::get).toList();
        List<String> blocked = bills.stream().filter((b) -> !isOpen(b))
                .map((b) -> b.getBillDate().toString().replace('-', '/') + " -" + b.getDocNo()).toList();
        if (!blocked.isEmpty()) {
            throw ApiException.badRequest("선택한 청구리스트 중 일부는 삭제가 불가능합니다.\n다음 사항을 확인 바랍니다.\n\n"
                    + "[삭제가 불가능한 청구리스트]\n1. 일괄반영한 내역\n" + String.join("\n", blocked));
        }
        repository.deleteAll(bills);
    }

    /**
     * 청구예정자료미생성현황(E060909) — 청구예정월 구간에서 계약 줄이 청구될 달 중 아직 청구예정자료를 만들지 않은 것.
     * 원본 기본은 금액 0 인 줄을 빼고, [금액0포함] 이면 넣는다.
     */
    @Transactional(readOnly = true)
    public List<ContractBillDtos.UnbilledLine> unbilled(java.time.YearMonth from, java.time.YearMonth to, boolean includeZero) {
        java.util.Set<String> billed = new java.util.HashSet<>();
        for (Object[] r : repository.findBilledMonths(from.toString(), to.toString())) billed.add(r[0] + "@" + r[1]);
        return contractService.scheduled(from, to).stream()
                .filter((s) -> !billed.contains(s.line().getId() + "@" + s.month()))
                .filter((s) -> includeZero || s.line().getSupplyAmount().signum() != 0)
                .map((s) -> ContractBillDtos.UnbilledLine.from(s.line(), s.month().toString())).toList();
    }

    /** 회계/판매일괄반영 · 회계미반영현황(계약) — 청구자료생성일자 안의 줄 전부. reflected=false 면 아직 반영 안 된 줄만. */
    @Transactional(readOnly = true)
    public List<BillLineView> lines(LocalDate from, LocalDate to, Boolean reflected) {
        return repository.findLinesInPeriod(from != null ? from : LocalDate.of(1900, 1, 1), to != null ? to : LocalDate.of(9999, 12, 31))
                .stream()
                .filter((l) -> reflected == null || reflected == l.isReflected())
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
            if (l.isReflected()) {
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
        for (ContractBillLine l : ls) {
            l.setJournalEntryId(je.getId());
            l.setReflectedEntryDate(je.getEntryDate());
            l.setReflectedEntryNo(entryNo(je.getDocNo()));
        }
        return je.getId();
    }

    /**
     * [판매반영 › 판매전표 발행] 판매입력 창 [저장(F8)] — 고른 줄(한 거래처)의 계약 줄 상세-품목연결설정을 판매 한 장의 줄로 만든다.
     * 품목 수량은 연결설정 수량 × 청구 수량, 금액은 연결설정 공급가액 · 부가세 × 청구 수량. 판매가 생기면 그 줄은 회계반영 · 판매반영
     * 두 격자에서 빠지고, 판매조회에서 지우면 다시 나온다(원본 2026/10/13 -8 실측).
     */
    @Transactional
    public Long reflectSales(ContractBillDtos.SalesReflectRequest req, String username) {
        List<ContractBillLine> ls = repository.findLinesByIds(req.lineIds());
        if (ls.size() != req.lineIds().stream().distinct().count()) throw ApiException.notFound("청구자료를 찾을 수 없습니다.");
        Long partnerId = ls.get(0).getContractLine().getContract().getPartner().getId();
        List<SalesDtos.SalesLineRequest> lines = new ArrayList<>();
        for (ContractBillLine l : ls) {
            if (l.isReflected()) {
                throw ApiException.badRequest("이미 반영된 청구자료입니다: " + l.getBill().getBillDate() + " -" + l.getBill().getDocNo());
            }
            if (!l.getContractLine().getContract().getPartner().getId().equals(partnerId)) {
                throw ApiException.badRequest("거래처가 다른 청구자료는 한 전표로 반영할 수 없습니다.");
            }
            if (l.getContractLine().getProducts().isEmpty()) {
                throw ApiException.badRequest("계약입력 시, 입력한 계약항목의 상세-품목연결설정을 해야합니다.");
            }
            BigDecimal times = l.getQuantity();
            for (var p : l.getContractLine().getProducts()) {
                lines.add(new SalesDtos.SalesLineRequest(p.getItem().getId(), p.getQuantity().multiply(times), p.getUnitPrice(),
                        null, null, null, null, p.getSupplyAmount().multiply(times), req.taxable() ? p.getVatAmount().multiply(times) : null));
            }
        }
        var c = ls.get(0).getContractLine().getContract();
        SalesDtos.SalesResponse sale = salesService.create(new SalesDtos.CreateSalesRequest(partnerId, req.warehouseId(),
                req.saleDate() != null ? req.saleDate() : LocalDate.now(), req.taxable(), null,
                c.getProject() != null ? c.getProject().getId() : null, null, false, lines), username);
        for (ContractBillLine l : ls) l.setSalesId(sale.id());
        return sale.id();
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
            BigDecimal vat = e.getLines().stream().filter((l) -> StandardAccounts.VAT_RECEIVED.equals(l.getAccount().getCode()))
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

    /**
     * 청구자료수정 [회계전표삭제] → '회계전표번호보기' 창(2026-10-13 · 10-21 실측) — ● 연결회계전표내역: 청구예정자료 '20261021-1' · 회계전표 '2026/10/21-16'.
     * 이 청구자료의 줄이 든 전표마다, 그 전표에 묶인 청구자료를 모두 보인다. 전표를 회계 쪽에서 지웠어도 반영한 번호 그대로 보인다.
     */
    @Transactional(readOnly = true)
    public List<ContractBillDtos.JournalLink> journalLinks(Long billId) {
        List<LinkKey> keys = linkKeys(get(billId));
        if (keys.isEmpty()) return List.of();
        List<ContractBillDtos.JournalLink> out = new ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (ContractBillLine l : repository.findAccountingLinkedLines()) {
            LinkKey k = LinkKey.of(l);
            if (!keys.contains(k) || !seen.add(l.getBill().getId() + "@" + k)) continue;
            out.add(new ContractBillDtos.JournalLink(l.getBill().getId(), l.getBill().getBillDate(), l.getBill().getDocNo(),
                    l.getJournalEntryId(), k.date(), k.no()));
        }
        return out;
    }

    /** 반영 연결 하나 — 반영한 매출전표 I 의 일자 · 번호(전표가 지워져도 남는다). */
    private record LinkKey(LocalDate date, Integer no) {
        static LinkKey of(ContractBillLine l) { return new LinkKey(l.getReflectedEntryDate(), l.getReflectedEntryNo()); }
    }

    private static List<LinkKey> linkKeys(ContractBill b) {
        return b.getLines().stream().filter(ContractBillLine::isAccountingLinked).map(LinkKey::of).distinct().toList();
    }

    /**
     * '회계전표번호보기' [삭제] → '삭제하겠습니까?' [확인] — 연결된 매출전표를(아직 있으면) 지우고, 그 전표에 묶인 청구자료(다른 청구생성번호까지)를
     * 미반영으로 되돌린다(원본 안내: "[삭제]를 할 경우, 연결된 다른 청구생성번호 역시 회계반영이 취소됩니다.").
     * 전표를 회계 쪽에서 먼저 지운 경우에도 이것으로 연결이 풀린다(2026-10-21 실측). 그 뒤 청구자료수정 창은 다시 [저장(F8)] · 닫기 · 삭제 다.
     */
    @Transactional
    public void unreflect(Long billId) {
        ContractBill b = get(billId);
        List<LinkKey> keys = linkKeys(b);
        if (keys.isEmpty()) throw ApiException.badRequest("회계반영된 청구자료가 아닙니다.");
        java.util.Set<Long> jids = new java.util.LinkedHashSet<>();
        for (ContractBillLine l : repository.findAccountingLinkedLines()) {
            if (!keys.contains(LinkKey.of(l))) continue;
            if (l.getJournalEntryId() != null) jids.add(l.getJournalEntryId());
            l.clearAccountingLink();
        }
        repository.flush();
        for (Long jid : jids) if (journalRepository.existsById(jid)) journalService.deleteManual(jid);
    }

    private static int nz(Integer v) { return v != null ? v : 0; }

    /** 'JE-20261013-0006' → 6 (회계거래조회의 '26/10/13-6'). */
    private static Integer entryNo(String docNo) {
        if (docNo == null) return null;
        int dash = docNo.lastIndexOf('-');
        try { return Integer.valueOf(docNo.substring(dash + 1)); } catch (NumberFormatException ex) { return null; }
    }

    private static boolean isOpen(ContractBill b) {
        return b.getLines().stream().noneMatch(ContractBillLine::isReflected) && !b.isSalesCreated();
    }

    private static void requireOpen(ContractBill b) {
        if (!isOpen(b)) {
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

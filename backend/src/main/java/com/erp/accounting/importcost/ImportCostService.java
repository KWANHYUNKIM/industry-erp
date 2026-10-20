package com.erp.accounting.importcost;

import com.erp.accounting.account.Account;
import com.erp.accounting.account.AccountRepository;
import com.erp.accounting.bankcard.BankAccount;
import com.erp.accounting.bankcard.BankAccountRepository;
import com.erp.accounting.importcost.dto.ImportCostDtos.*;
import com.erp.accounting.journal.JournalEntry;
import com.erp.accounting.journal.JournalService;
import com.erp.accounting.journal.JournalService.Posting;
import com.erp.common.ApiException;
import com.erp.inventory.project.ProjectService;
import com.erp.trade.partner.BusinessPartner;
import com.erp.trade.partner.PartnerService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;

/**
 * 회계 II › 수입비용(輸入 — 미착품) 묶음 열 화면의 서버(원본 2026-10-14 loginaa 실측, plans/회계2/수입비용.md).
 * 관리번호 · 비용항목 마스터, 전표 여섯 가지(저장 = 회계전표 한 장), 수입관리대장 집계.
 */
@Service
@RequiredArgsConstructor
public class ImportCostService {

    /** 미착품 — 원본 1689(우리 계정은 세 자리라 168). */
    static final String GOODS_IN_TRANSIT = "168";
    static final String ACCOUNTS_PAYABLE = "251";
    static final String VAT_RECEIVABLE = "135";
    static final String FEE = "831";

    private final ImportCostItemRepository itemRepository;
    private final ImportLotRepository lotRepository;
    private final ImportCostVoucherRepository voucherRepository;
    private final AccountRepository accountRepository;
    private final BankAccountRepository bankAccountRepository;
    private final JournalService journalService;
    private final PartnerService partnerService;
    private final ProjectService projectService;

    // ── 비용항목 ─────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<CostItemResponse> items() {
        return itemRepository.findAllByOrderBySortOrderAscCodeAsc().stream().map(ImportCostService::toItem).toList();
    }

    @Transactional
    public CostItemResponse createItem(CreateCostItemRequest req) {
        String code = req.code().trim();
        // 원본 문구 그대로(2026-10-14 '12' 로 저장해 봄)
        if (itemRepository.existsByCode(code)) throw ApiException.conflict("이미 비용항목등록에 존재하는 코드입니다.");
        return toItem(itemRepository.save(ImportCostItem.builder()
                .code(code).name(req.name().trim()).sortOrder(req.sortOrder()).active(true).build()));
    }

    @Transactional
    public CostItemResponse updateItem(Long id, UpdateCostItemRequest req) {
        ImportCostItem i = item(id);
        i.setName(req.name().trim());
        i.setSortOrder(req.sortOrder());
        if (req.active() != null) i.setActive(req.active());
        return toItem(i);
    }

    /** 원본에는 지우는 단추가 없다(사용중단만). QA 자료 치우기용 — 전표가 쓰고 있으면 막는다. */
    @Transactional
    public void deleteItem(Long id) {
        if (voucherRepository.existsByCostItemId(id)) throw ApiException.conflict("전표에서 쓰고 있는 비용항목입니다.");
        itemRepository.delete(item(id));
    }

    // ── 관리번호 ─────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<LotResponse> lots() {
        return lotRepository.findAllWithPartner().stream().map(ImportCostService::toLot).toList();
    }

    /** 신규 창의 [관리번호코드] 처음 값 — 원본 '000000004'(9자리 숫자 코드 중 가장 큰 것 + 1). */
    @Transactional(readOnly = true)
    public String nextLotCode() {
        long max = lotRepository.findAllCodes().stream().filter(c -> c.matches("\\d{1,18}"))
                .mapToLong(Long::parseLong).max().orElse(0);
        return String.format("%09d", max + 1);
    }

    @Transactional
    public LotResponse createLot(CreateLotRequest req) {
        String code = req.code() == null || req.code().isBlank() ? nextLotCode() : req.code().trim();
        if (lotRepository.existsByCode(code)) throw ApiException.conflict("이미 등록된 관리번호코드입니다.");
        return toLot(lotRepository.save(ImportLot.builder()
                .code(code).name(req.name().trim()).partner(partnerService.get(req.partnerId()))
                .firstTradeDate(req.firstTradeDate()).remark(blankToNull(req.remark())).active(true).build()));
    }

    @Transactional
    public LotResponse updateLot(Long id, UpdateLotRequest req) {
        ImportLot l = lot(id);
        l.setName(req.name().trim());
        l.setPartner(partnerService.get(req.partnerId()));
        l.setFirstTradeDate(req.firstTradeDate());
        l.setRemark(blankToNull(req.remark()));
        if (req.active() != null) l.setActive(req.active());
        return toLot(l);
    }

    @Transactional
    public void deleteLot(Long id) {
        if (voucherRepository.existsByLotId(id)) throw ApiException.conflict("전표에서 쓰고 있는 관리번호입니다.");
        lotRepository.delete(lot(id));
    }

    // ── 전표 ─────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<VoucherResponse> vouchers(LocalDate from, LocalDate to) {
        return voucherRepository.findInPeriod(from, to).stream().map(ImportCostService::toVoucher).toList();
    }

    @Transactional(readOnly = true)
    public VoucherResponse voucher(Long id) {
        return toVoucher(voucherEntity(id));
    }

    @Transactional
    public VoucherResponse create(SaveVoucherRequest req, String username) {
        ImportCostVoucher v = ImportCostVoucher.builder().kind(kindOf(req.kind())).createdBy(username).build();
        apply(v, req);
        voucherRepository.save(v);
        post(v, username);
        return toVoucher(v);
    }

    @Transactional
    public VoucherResponse update(Long id, SaveVoucherRequest req, String username) {
        ImportCostVoucher v = voucherEntity(id);
        LocalDate locked = v.getVoucherDate();          // 원본 수정 창은 전표일자가 잠겨 있다
        apply(v, req);
        v.setVoucherDate(locked);
        post(v, username);
        return toVoucher(v);
    }

    /** 원본 [선택삭제] · 수정 창 [삭제] — 회계전표도 같이 지운다. */
    @Transactional
    public void delete(List<Long> ids) {
        for (Long id : ids) {
            ImportCostVoucher v = voucherEntity(id);
            JournalEntry e = v.getJournalEntry();
            voucherRepository.delete(v);
            voucherRepository.flush();
            journalService.deleteEntry(e);
        }
    }

    private void apply(ImportCostVoucher v, SaveVoucherRequest req) {
        ImportCostKind kind = v.getKind();
        // 원본: 빈 채 저장하면 [관리번호] 칸이 빨개진다
        if (req.lotId() == null) throw ApiException.badRequest("관리번호: 자료를 입력 바랍니다.");
        v.setVoucherDate(req.voucherDate());
        v.setLot(lot(req.lotId()));
        v.setAmount(nz(req.amount()));
        v.setVat(kind == ImportCostKind.TAX_INVOICE ? nz(req.vat()) : BigDecimal.ZERO);
        v.setFee(kind == ImportCostKind.TRANSFER ? BigDecimal.ZERO : nz(req.fee()));
        // 원본(2026-10-20): 관리번호를 골라도 거래처는 안 따라오고, 빈 채 저장하면 '아래의 경우 처리가 불가능합니다.' 창에
        // '거래처가 입력되지 않은 자료' — 본계정대체에는 거래처 칸이 없다
        if (kind != ImportCostKind.TRANSFER && req.partnerId() == null)
            throw ApiException.badRequest("거래처가 입력되지 않은 자료");
        v.setPartner(kind == ImportCostKind.TRANSFER ? null : partnerService.get(req.partnerId()));
        v.setCostItem(kind == ImportCostKind.TAX_INVOICE || kind == ImportCostKind.GENERAL_RECEIPT
                ? (req.costItemId() != null ? item(req.costItemId()) : null) : null);
        v.setDepartmentId(req.departmentId());
        v.setProject(req.projectId() != null ? projectService.get(req.projectId()) : null);
        v.setVatType(kind == ImportCostKind.TAX_INVOICE ? (req.vatType() == null || req.vatType().isBlank() ? "세금계산서" : req.vatType()) : null);
        v.setRemark(blankToNull(req.remark()));
        if (kind.isPayment()) {
            if (req.bankAccountId() == null) throw ApiException.badRequest("출금계좌: 자료를 입력 바랍니다.");
            v.setBankAccount(bankAccountRepository.findById(req.bankAccountId())
                    .orElseThrow(() -> ApiException.notFound("계좌를 찾을 수 없습니다.")));
            v.setAccount(null);
        } else if (kind == ImportCostKind.TRANSFER) {
            if (req.accountId() == null) throw ApiException.badRequest("구입자산: 자료를 입력 바랍니다.");
            v.setAccount(account(req.accountId()));
            v.setBankAccount(null);
        } else {
            v.setAccount(req.accountId() != null ? account(req.accountId()) : code(ACCOUNTS_PAYABLE));
            v.setBankAccount(null);
        }
    }

    /** 회계전표 한 장을 만들거나 고친다 — 분개는 {@link ImportCostKind} 주석(원본 계정별원장 실측). */
    private void post(ImportCostVoucher v, String username) {
        BigDecimal amt = v.getAmount(), vat = v.getVat(), fee = v.getFee();
        List<Posting> lines = new ArrayList<>();
        switch (v.getKind()) {
            case BILL_RECEIPT, TAX_INVOICE, GENERAL_RECEIPT -> {
                lines.add(new Posting(true, code(GOODS_IN_TRANSIT), amt));
                if (vat.signum() != 0) lines.add(new Posting(true, code(VAT_RECEIVABLE), vat));
                // 원본 청구서의 수수료 5,000 은 외상매입금엔 붙고 미착품(수입관리대장)엔 안 들어갔다 — 지급수수료로 둔다
                if (fee.signum() != 0) lines.add(new Posting(true, code(FEE), fee));
                lines.add(new Posting(false, v.getAccount(), amt.add(vat).add(fee)));
            }
            case TRADE_PAYMENT, BROKER_PAYMENT -> {
                lines.add(new Posting(true, code(ACCOUNTS_PAYABLE), amt));
                if (fee.signum() != 0) lines.add(new Posting(true, code(FEE), fee));
                lines.add(new Posting(false, v.getBankAccount().getGlAccount(), amt.add(fee)));
            }
            case TRANSFER -> {
                lines.add(new Posting(true, v.getAccount(), amt));
                lines.add(new Posting(false, code(GOODS_IN_TRANSIT), amt));
            }
        }
        String desc = v.getRemark() != null ? v.getRemark() : v.getKind().getDisplayName();
        BusinessPartner partner = v.getPartner();
        JournalEntry e = journalService.saveImportCost(v.getJournalEntry(), v.getId(), v.getVoucherDate(), desc, partner,
                username, lines, v.getDepartmentId(), v.getProject() != null ? v.getProject().getId() : null);
        v.setJournalEntry(e);
    }

    // ── 수입관리대장 ─────────────────────────────────────────

    /**
     * 관리번호마다 한 줄 — 이월잔액(기간 앞) · 상품대금(청구서) · 비용항목 열(계산서 · 영수증의 공급가) · 합계 · 대체금액 · 잔액
     * · 최초대금지급일 · 통관일 · 거래대금지급 · 관세사에지급. 원본 2026-10-14: 청구서 100,000 + 계산서 20,000 + 영수증 10,000
     * → 합계 130,000, 대체 130,000 → 잔액 빈칸(0), 대체를 지우면 잔액 130,000.
     */
    @Transactional(readOnly = true)
    public LedgerResponse ledger(LocalDate from, LocalDate to, Long lotId, Long partnerId,
                                 boolean includeZero, boolean includeInactive) {
        List<CostItemResponse> items = items().stream().filter(CostItemResponse::active).toList();
        Map<Long, Acc> byLot = new LinkedHashMap<>();
        for (ImportLot l : lotRepository.findAllWithPartner()) byLot.put(l.getId(), new Acc(l));
        for (ImportCostVoucher v : voucherRepository.findUntil(to)) {
            Acc a = byLot.get(v.getLot().getId());
            if (a == null) continue;
            boolean before = v.getVoucherDate().isBefore(from);
            BigDecimal amt = v.getAmount();
            switch (v.getKind()) {
                case BILL_RECEIPT -> { if (before) a.carry = a.carry.add(amt); else a.goods = a.goods.add(amt); }
                case TAX_INVOICE, GENERAL_RECEIPT -> {
                    if (before) a.carry = a.carry.add(amt);
                    else if (v.getCostItem() != null) a.costs.merge(v.getCostItem().getId(), amt, BigDecimal::add);
                    else a.uncategorized = a.uncategorized.add(amt);
                }
                case TRANSFER -> {
                    if (before) a.carry = a.carry.subtract(amt);
                    else {
                        a.transfer = a.transfer.add(amt);
                        if (a.clearance == null || v.getVoucherDate().isAfter(a.clearance)) a.clearance = v.getVoucherDate();
                    }
                }
                // 원본 2026-10-20: 거래대금지급 500 + 수수료 50 → 대장 [거래대금지급] 550 (계좌에서 나간 돈)
                case TRADE_PAYMENT -> {
                    if (a.firstPayment == null || v.getVoucherDate().isBefore(a.firstPayment)) a.firstPayment = v.getVoucherDate();
                    if (!before) a.trade = a.trade.add(amt).add(v.getFee());
                }
                case BROKER_PAYMENT -> { if (!before) a.broker = a.broker.add(amt).add(v.getFee()); }
            }
            a.touched = true;
        }
        List<LedgerRow> rows = new ArrayList<>();
        for (Acc a : byLot.values()) {
            if (lotId != null && !lotId.equals(a.lot.getId())) continue;
            if (partnerId != null && !partnerId.equals(a.lot.getPartner().getId())) continue;
            if (!includeInactive && !a.lot.isActive()) continue;
            BigDecimal costSum = a.costs.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add).add(a.uncategorized);
            BigDecimal total = a.goods.add(costSum);
            BigDecimal balance = a.carry.add(total).subtract(a.transfer);
            if (!a.touched) continue;
            if (!includeZero && balance.signum() == 0) continue;
            rows.add(new LedgerRow(a.lot.getId(), a.lot.getCode(), a.lot.getName(), a.lot.getPartner().getName(), a.lot.isActive(),
                    a.carry, a.goods, a.costs, total, a.transfer, balance, a.firstPayment, a.clearance, a.trade, a.broker));
        }
        return new LedgerResponse(items, rows);
    }

    private static final class Acc {
        final ImportLot lot;
        BigDecimal carry = BigDecimal.ZERO, goods = BigDecimal.ZERO, uncategorized = BigDecimal.ZERO,
                transfer = BigDecimal.ZERO, trade = BigDecimal.ZERO, broker = BigDecimal.ZERO;
        final Map<Long, BigDecimal> costs = new LinkedHashMap<>();
        LocalDate firstPayment, clearance;
        boolean touched;
        Acc(ImportLot lot) { this.lot = lot; }
    }

    // ── 내부 ─────────────────────────────────────────────────

    private ImportCostKind kindOf(String kind) {
        try {
            return ImportCostKind.valueOf(kind);
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("알 수 없는 수입비용 전표 종류입니다: " + kind);
        }
    }

    private ImportCostItem item(Long id) {
        return itemRepository.findById(id).orElseThrow(() -> ApiException.notFound("비용항목을 찾을 수 없습니다."));
    }

    private ImportLot lot(Long id) {
        return lotRepository.findById(id).orElseThrow(() -> ApiException.notFound("관리번호를 찾을 수 없습니다."));
    }

    private ImportCostVoucher voucherEntity(Long id) {
        return voucherRepository.findById(id).orElseThrow(() -> ApiException.notFound("수입비용 전표를 찾을 수 없습니다."));
    }

    private Account account(Long id) {
        return accountRepository.findById(id).orElseThrow(() -> ApiException.notFound("계정을 찾을 수 없습니다."));
    }

    private Account code(String code) {
        return accountRepository.findByCode(code)
                .orElseThrow(() -> ApiException.badRequest("계정과목이 없습니다: " + code + " (계정과목등록 필요)"));
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static CostItemResponse toItem(ImportCostItem i) {
        return new CostItemResponse(i.getId(), i.getCode(), i.getName(), i.getSortOrder(), i.isActive());
    }

    private static LotResponse toLot(ImportLot l) {
        BusinessPartner p = l.getPartner();
        return new LotResponse(l.getId(), l.getCode(), l.getName(), p.getId(), p.getCode(), p.getName(),
                l.getFirstTradeDate(), l.getRemark(), l.isActive());
    }

    /**
     * 전표검색 [금액] — 원본 2026-10-20: 청구서 1,000 + 수수료 100 → 1,000(수수료 빼고), 거래대금지급 500 + 수수료 50 → 550,
     * 세금계산서 공급가 20,000 + 부가세 2,000 → 22,000.
     */
    private static BigDecimal listAmount(ImportCostVoucher v) {
        BigDecimal base = v.getAmount().add(v.getVat());
        return v.getKind().isPayment() ? base.add(v.getFee()) : base;
    }

    private static VoucherResponse toVoucher(ImportCostVoucher v) {
        BusinessPartner p = v.getPartner();
        Account a = v.getAccount();
        BankAccount b = v.getBankAccount();
        JournalEntry e = v.getJournalEntry();
        return new VoucherResponse(v.getId(), v.getVoucherDate(), v.getKind().name(), v.getKind().getDisplayName(),
                v.getLot().getId(), v.getLot().getCode(), v.getLot().getName(),
                p != null ? p.getId() : null, p != null ? p.getCode() : null, p != null ? p.getName() : null,
                v.getCostItem() != null ? v.getCostItem().getId() : null, v.getCostItem() != null ? v.getCostItem().getName() : null,
                v.getAmount(), v.getVat(), v.getFee(), listAmount(v),
                a != null ? a.getId() : null, a != null ? a.getCode() : null, a != null ? a.getName() : null,
                b != null ? b.getId() : null, b != null ? (b.getCode() != null ? b.getCode() : b.getAccountNo()) : null,
                b != null ? (b.getName() != null ? b.getName() : b.getBankName()) : null,
                v.getDepartmentId(), v.getProject() != null ? v.getProject().getId() : null,
                v.getProject() != null ? v.getProject().getName() : null,
                v.getVatType(), v.getRemark(), e != null ? e.getId() : null, e != null ? e.getDocNo() : null);
    }
}

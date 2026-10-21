package com.erp.accounting.fixedasset;

import com.erp.accounting.journal.JournalService;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.accounting.account.Account;
import com.erp.accounting.journal.JournalEntry;
import com.erp.accounting.fixedasset.dto.FixedAssetDtos.AssetResponse;
import com.erp.accounting.fixedasset.dto.FixedAssetDtos.CreateAssetRequest;
import com.erp.accounting.fixedasset.dto.FixedAssetDtos.DepreciationResponse;
import com.erp.accounting.fixedasset.dto.FixedAssetDtos.DepreciationRunResponse;
import com.erp.accounting.fixedasset.dto.FixedAssetDtos.DisposeRequest;
import com.erp.accounting.account.AccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import com.erp.accounting.account.AccountDivision;
import com.erp.accounting.fixedasset.dto.FixedAssetDtos;

/**
 * 회계 I > 고정자산 — 취득 등록 · 월별 감가상각 · 처분.
 * 상각과 처분은 저장과 동시에 분개를 만든다(JournalService).
 */
@Service
@RequiredArgsConstructor
public class FixedAssetService {

    private static final BigDecimal MONTHS_PER_YEAR = new BigDecimal("12");
    private static final BigDecimal HUNDRED = new BigDecimal("100");

    private final FixedAssetRepository assetRepository;
    private final DepreciationRepository depreciationRepository;
    private final AccountRepository accountRepository;
    private final JournalService journalService;
    private final DocumentNoGenerator docNoGenerator;
    /* accounting → settings 는 허용된 방향이다(CLAUDE.md 4.1). 회계연도 시작월(환경설정)을 읽는다. */
    private final com.erp.settings.preference.PreferenceService preferenceService;

    @Transactional(readOnly = true)
    public List<AssetResponse> findAll() {
        return findAll(null, null);
    }

    /**
     * 화면 조건 판의 <b>[기간]</b>. 예전에는 물어보지도 않고 전 기간을 통째로 주었다.
     * 안 주면 <b>넓은 경계</b>로 채운다 — <code>:from is null or …</code> 는 42P18 로 터진다.
     */
    @Transactional(readOnly = true)
    public List<AssetResponse> findAll(java.time.LocalDate from, java.time.LocalDate to) {
        return assetRepository.findAllWithAccount(
                from != null ? from : java.time.LocalDate.of(1900, 1, 1),
                to != null ? to : java.time.LocalDate.of(9999, 12, 31)).stream().map(AssetResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<DepreciationResponse> findDepreciations(String period) {
        return findDepreciations(period, null, null);
    }

    /**
     * 화면 조건 판의 <b>[기간]</b>. 예전에는 물어보지도 않고 전 기간을 통째로 주었다.
     * 안 주면 <b>넓은 경계</b>로 채운다 — <code>:from is null or …</code> 는 42P18 로 터진다.
     */
    @Transactional(readOnly = true)
    public List<DepreciationResponse> findDepreciations(String period,
                                                        java.time.LocalDate from, java.time.LocalDate to) {
        List<Depreciation> rows = period != null && !period.isBlank()
                ? depreciationRepository.findByPeriodWithRefs(period)
                : depreciationRepository.findAllWithRefs(
                from != null ? from : java.time.LocalDate.of(1900, 1, 1),
                to != null ? to : java.time.LocalDate.of(9999, 12, 31));
        return rows.stream().map(DepreciationResponse::from).toList();
    }

    private void validate(CreateAssetRequest req) {
        BigDecimal salvage = req.salvageValue() != null ? req.salvageValue() : BigDecimal.ZERO;
        if (salvage.compareTo(req.acquisitionCost()) >= 0) {
            throw ApiException.badRequest("잔존가액은 취득가액보다 작아야 합니다.");
        }
        if (req.method() == DepreciationMethod.DECLINING_BALANCE
                && (req.declineRate() == null || req.declineRate().signum() <= 0)) {
            throw ApiException.badRequest("정률법은 연 상각률(%)이 필요합니다.");
        }
    }

    @Transactional
    public AssetResponse create(CreateAssetRequest req, String username) {
        validate(req);
        BigDecimal salvage = req.salvageValue() != null ? req.salvageValue() : BigDecimal.ZERO;

        FixedAsset asset = FixedAsset.builder()
                .assetNo(docNoGenerator.next("FA-", "fixed_assets", "asset_no", "acquisition_date", req.acquisitionDate()))
                .name(req.name())
                .assetAccount(assetAccount(req.assetAccountId()))
                .acquisitionDate(req.acquisitionDate())
                .acquisitionCost(req.acquisitionCost())
                .salvageValue(salvage)
                .usefulLifeYears(req.usefulLifeYears())
                .method(req.method())
                .declineRate(req.method() == DepreciationMethod.DECLINING_BALANCE ? req.declineRate() : null)
                .accumulatedDepreciation(BigDecimal.ZERO)
                .status(AssetStatus.IN_USE)
                .remark(req.remark())
                .createdBy(username)
                .build();
        applyAccounts(asset, req);
        FixedAsset saved = assetRepository.save(asset);
        journalService.createFromAcquisition(saved);      // 원본 고정자산증가 전표 — 차) 자산 · 부가세 / 대) 출금
        return AssetResponse.from(saved);
    }

    /**
     * 고치기. 감가상각이 한 번이라도 잡혔으면 이름 · 적요 · 출금계정 · 부가세만 바뀐다 — 취득가 · 계정을 바꾸면 이미 만든
     * 상각 분개와 누계액이 어긋난다(원본은 상각을 지운 뒤 고친다). 처분된 자산은 처분을 취소한 뒤 고친다.
     */
    @Transactional
    public AssetResponse update(Long id, FixedAssetDtos.UpdateAssetRequest upd, String username) {
        FixedAsset asset = find(id);
        if (asset.getStatus() == AssetStatus.DISPOSED) {
            throw ApiException.conflict("처분된 자산은 고칠 수 없습니다 — 처분을 취소한 뒤 고치세요: " + asset.getAssetNo());
        }
        CreateAssetRequest req = upd.asCreate();
        if (depreciationRepository.existsByAssetId(id)) {
            boolean same = asset.getAcquisitionCost().compareTo(req.acquisitionCost()) == 0
                    && asset.getAcquisitionDate().equals(req.acquisitionDate())
                    && asset.getAssetAccount().getId().equals(req.assetAccountId())
                    && asset.getUsefulLifeYears().equals(req.usefulLifeYears())
                    && asset.getMethod() == req.method()
                    && asset.getSalvageValue().compareTo(req.salvageValue() != null ? req.salvageValue() : BigDecimal.ZERO) == 0
                    && java.util.Objects.equals(idOf(asset.getAccumAccount()), req.accumAccountId())
                    && java.util.Objects.equals(idOf(asset.getExpenseAccount()), req.expenseAccountId());
            if (!same) {
                throw ApiException.badRequest("감가상각이 잡힌 자산은 취득 내용 · 계정을 고칠 수 없습니다 — 상각을 마지막 달부터 취소한 뒤 고치세요: "
                        + asset.getAssetNo());
            }
        }
        validate(req);
        asset.setName(req.name());
        asset.setAssetAccount(assetAccount(req.assetAccountId()));
        asset.setAcquisitionDate(req.acquisitionDate());
        asset.setAcquisitionCost(req.acquisitionCost());
        asset.setSalvageValue(req.salvageValue() != null ? req.salvageValue() : BigDecimal.ZERO);
        asset.setUsefulLifeYears(req.usefulLifeYears());
        asset.setMethod(req.method());
        asset.setDeclineRate(req.method() == DepreciationMethod.DECLINING_BALANCE ? req.declineRate() : null);
        asset.setRemark(req.remark());
        applyAccounts(asset, req);
        journalService.recreateFromAcquisition(asset);
        return AssetResponse.from(asset);
    }

    /** 삭제 — 원본 고정자산코드 [삭제]. 상각 · 처분이 남아 있으면 먼저 취소해야 한다. 취득 분개도 같이 지운다. */
    @Transactional
    public void delete(Long id) {
        FixedAsset asset = find(id);
        if (asset.getStatus() == AssetStatus.DISPOSED) {
            throw ApiException.conflict("처분된 자산은 삭제할 수 없습니다 — 처분을 먼저 취소하세요: " + asset.getAssetNo());
        }
        if (depreciationRepository.existsByAssetId(id)) {
            throw ApiException.conflict("감가상각 내역이 있는 자산은 삭제할 수 없습니다 — 상각을 먼저 취소하세요: " + asset.getAssetNo());
        }
        journalService.deleteBySource(com.erp.accounting.journal.JournalSourceType.ASSET_ACQUISITION, id);
        assetRepository.delete(asset);
    }

    /**
     * 감가상각 취소 — 원본 감가상각계산 [삭제](그 기간 묶음을 통째로). 그 달의 상각 행과 분개를 지우고 누계액을 되돌린다.
     * 그 뒤 달 상각이 있는 자산이 하나라도 있으면 막는다(마지막 달부터). 처분된 자산도 막는다(처분 취소가 먼저).
     */
    @Transactional
    public DepreciationRunResponse cancelDepreciation(String period, Long assetId) {
        YearMonth ym = parsePeriod(period);
        /* assetId 를 주면 그 자산의 그 달만(목록 줄의 [취소]) — 남의 자산 상각까지 묶여 막히지 않게. */
        List<Depreciation> rows = depreciationRepository.findByPeriodForCancel(ym.toString()).stream()
                .filter((d) -> assetId == null || d.getAsset().getId().equals(assetId)).toList();
        if (rows.isEmpty()) {
            throw ApiException.badRequest("생성된 감가상각내역이 없습니다. (" + ym + ")");
        }
        for (Depreciation d : rows) {
            FixedAsset a = d.getAsset();
            if (a.getStatus() == AssetStatus.DISPOSED) {
                throw ApiException.conflict(a.getAssetNo() + " " + a.getName() + " 은(는) 처분된 자산입니다 — 처분을 먼저 취소하세요.");
            }
            List<String> later = depreciationRepository.findPeriodsByAssetId(a.getId()).stream()
                    .filter((p) -> p.compareTo(ym.toString()) > 0).sorted().toList();
            if (!later.isEmpty()) {
                throw ApiException.badRequest(a.getAssetNo() + " " + a.getName() + " 은(는) 뒤 달 " + String.join(", ", later)
                        + " 상각이 있습니다 — 마지막 달부터 취소하세요.");
            }
        }
        BigDecimal total = BigDecimal.ZERO;
        List<DepreciationResponse> done = new ArrayList<>();
        for (Depreciation d : rows) {
            FixedAsset a = d.getAsset();
            a.setAccumulatedDepreciation(a.getAccumulatedDepreciation().subtract(d.getAmount()));
            done.add(DepreciationResponse.from(d));
            total = total.add(d.getAmount());
            JournalEntry entry = d.getJournalEntry();
            depreciationRepository.delete(d);          // 상각 행이 분개를 가리키므로 먼저 지운다
            depreciationRepository.flush();
            journalService.deleteEntry(entry);
        }
        return new DepreciationRunResponse(ym.toString(), done.size(), total, 0, done, List.of());
    }

    /** 처분 취소 — 원본 고정자산감소 전표 [삭제]. 처분 분개를 지우고 사용중으로 되돌린다. */
    @Transactional
    public AssetResponse cancelDisposal(Long id) {
        FixedAsset asset = find(id);
        if (asset.getStatus() != AssetStatus.DISPOSED) {
            throw ApiException.badRequest("처분되지 않은 자산입니다: " + asset.getAssetNo());
        }
        journalService.deleteBySource(com.erp.accounting.journal.JournalSourceType.DISPOSAL, id);
        asset.setStatus(AssetStatus.IN_USE);
        asset.setDisposalDate(null);
        asset.setDisposalAmount(null);
        asset.setDisposalType(null);
        asset.setDisposalVat(null);
        asset.setReceiptAccount(null);
        return AssetResponse.from(asset);
    }

    /**
     * 특정 월(yyyy-MM)의 감가상각을 사용중 자산 전체에 대해 돌린다.
     * 이미 그 달을 상각한 자산, 취득 전인 자산, 더 상각할 금액이 없는 자산은 건너뛴다.
     * (asset, period) 유니크 제약이 있어 같은 달을 두 번 돌려도 이중 상각되지 않는다.
     */
    @Transactional
    public DepreciationRunResponse depreciate(String period, String username) {
        YearMonth ym = parsePeriod(period);
        LocalDate lastDay = ym.atEndOfMonth();

        List<DepreciationResponse> done = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        int skipped = 0;
        List<String> gaps = new ArrayList<>();

        String fiscalYearStart = fiscalYearStart(ym, fiscalStartMonth()).toString();
        for (FixedAsset asset : assetRepository.findByStatusWithAccount(AssetStatus.IN_USE)) {
            if (asset.getAcquisitionDate().isAfter(lastDay)) {          // 아직 취득 전
                skipped++;
                continue;
            }
            if (depreciationRepository.existsByAssetIdAndPeriod(asset.getId(), ym.toString())) {
                skipped++;
                continue;
            }
            BigDecimal amount = monthlyAmount(asset, fiscalYearStart);
            if (amount.signum() <= 0) {                                  // 상각 완료(잔존가액 도달)
                skipped++;
                continue;
            }

            asset.setAccumulatedDepreciation(asset.getAccumulatedDepreciation().add(amount));
            Depreciation d = Depreciation.builder()
                    .asset(asset)
                    .period(ym.toString())
                    .depreciationDate(lastDay)
                    .amount(amount)
                    .accumulatedAfter(asset.getAccumulatedDepreciation())
                    .bookValueAfter(asset.bookValue())
                    .createdBy(username)
                    .build();

            String missing = missingMonths(asset, ym);
            if (!missing.isEmpty()) gaps.add(asset.getName() + ": " + missing);

            Depreciation saved = depreciationRepository.save(d);   // 분개의 출처가 이 행이라 먼저 저장
            JournalEntry entry = journalService.createFromDepreciation(saved);
            saved.setJournalEntry(entry);
            done.add(DepreciationResponse.from(saved));
            total = total.add(amount);
        }
        return new DepreciationRunResponse(ym.toString(), done.size(), total, skipped, done, gaps);
    }

    /** 처분: 자산과 누계액을 장부에서 털어내고 처분손익을 인식한다. */
    @Transactional
    public AssetResponse dispose(Long id, DisposeRequest req, String username) {
        FixedAsset asset = assetRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("고정자산을 찾을 수 없습니다. id=" + id));
        if (asset.getStatus() == AssetStatus.DISPOSED) {
            throw ApiException.conflict("이미 처분된 자산입니다: " + asset.getAssetNo());
        }
        if (req.disposalDate().isBefore(asset.getAcquisitionDate())) {
            throw ApiException.badRequest("처분일이 취득일보다 빠를 수 없습니다.");
        }
        /*
         * 처분한 뒤의 달에 상각이 이미 잡혀 있으면 누계액이 부풀어 처분손익이 틀리고, 없는 자산의 감가상각비가
         * 남는다(QA 59회차 — 9월까지 상각한 자산을 7/15 처분일로 받아 줬다). 그 달들보다 뒤 날짜로 처분하게 한다.
         */
        String disposalMonth = YearMonth.from(req.disposalDate()).toString();
        List<String> after = depreciationRepository.findPeriodsByAssetId(asset.getId()).stream()
                .filter((p) -> p.compareTo(disposalMonth) > 0).sorted().toList();
        if (!after.isEmpty()) {
            throw ApiException.badRequest(String.format(
                    "%s 은(는) 처분일(%s) 뒤 달 %s 에 감가상각이 이미 잡혀 있습니다 — 처분일을 %s 이후로 하세요.",
                    asset.getAssetNo(), req.disposalDate(), String.join(", ", after),
                    YearMonth.parse(after.get(after.size() - 1)).atEndOfMonth()));
        }

        DisposalType type = req.disposalType() != null ? req.disposalType() : DisposalType.SALE;
        asset.setStatus(AssetStatus.DISPOSED);
        asset.setDisposalDate(req.disposalDate());
        asset.setDisposalType(type);
        /* 폐기는 매각액 · 부가세가 없다(원본 ○폐기). */
        asset.setDisposalAmount(type == DisposalType.SCRAP ? BigDecimal.ZERO : req.disposalAmount());
        asset.setDisposalVat(type == DisposalType.SCRAP || req.disposalVat() == null ? BigDecimal.ZERO : req.disposalVat());
        asset.setReceiptAccount(req.receiptAccountId() != null ? anyAccount(req.receiptAccountId()) : null);
        journalService.createFromDisposal(asset);
        return AssetResponse.from(asset);
    }

    // ── 내부 ──────────────────────────────────────────────────────────

    private FixedAsset find(Long id) {
        return assetRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("고정자산을 찾을 수 없습니다. id=" + id));
    }

    private static Long idOf(Account a) {
        return a != null ? a.getId() : null;
    }

    /** 자산마다 고르는 계정 셋(원본 E010610 감가상각충당금 · 감가상각비, E010611 출금계좌)과 취득 부가세. */
    private void applyAccounts(FixedAsset asset, CreateAssetRequest req) {
        Account accum = req.accumAccountId() != null ? anyAccount(req.accumAccountId()) : null;
        if (accum != null && !accum.getName().contains("누계") && !accum.getName().contains("충당")) {
            throw ApiException.badRequest("감가상각충당금계정은 감가상각누계액 계정이어야 합니다: " + accum.getCode() + " " + accum.getName());
        }
        Account expense = req.expenseAccountId() != null ? anyAccount(req.expenseAccountId()) : null;
        if (expense != null && expense.getDivision() != AccountDivision.EXPENSE) {
            throw ApiException.badRequest("감가상각비계정은 비용 계정이어야 합니다: " + expense.getCode() + " " + expense.getName());
        }
        asset.setAccumAccount(accum);
        asset.setExpenseAccount(expense);
        asset.setPaymentAccount(req.paymentAccountId() != null ? anyAccount(req.paymentAccountId()) : null);
        asset.setAcquisitionVat(req.acquisitionVat() != null ? req.acquisitionVat() : BigDecimal.ZERO);
    }

    private Account anyAccount(Long id) {
        return accountRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계정과목을 찾을 수 없습니다. id=" + id));
    }

    /** 취득한 달부터 이번 달 앞까지 상각 기록이 없는 달들. 열두 달을 넘으면 앞뒤만. */
    private String missingMonths(FixedAsset asset, YearMonth ym) {
        java.util.Set<String> done = new java.util.HashSet<>(depreciationRepository.findPeriodsByAssetId(asset.getId()));
        List<String> miss = new ArrayList<>();
        for (YearMonth m = YearMonth.from(asset.getAcquisitionDate()); m.isBefore(ym); m = m.plusMonths(1)) {
            if (!done.contains(m.toString())) miss.add(m.toString());
        }
        if (miss.size() > 12) return miss.get(0) + " ~ " + miss.get(miss.size() - 1) + " (" + miss.size() + "개월)";
        return String.join(", ", miss);
    }

    /*
     * 원 단위로 끊는다. 예전엔 소수 둘째 자리라 1,000만 원 · 5년이면 매달 166,666.67원이 분개에 찍혔다(34회차).
     * 반올림한 만큼의 끝전은 마지막 달이 남은 상각가능액으로 잘려 맞춰진다(raw.min(remaining)).
     */
    /**
     * 이번 달 상각액. 잔존가액 아래로는 내려가지 않도록 남은 상각가능액으로 자른다.
     *
     * <p>정률법은 <b>기초(회계연도 첫날) 미상각잔액 × 연 상각률</b>을 그해 열두 달에 1/12 씩 나눈다(법인세법 시행령 26조).
     * 예전엔 매달 <b>그달의</b> 장부가에 상각률/12 를 곱해 달마다 복리로 줄었다 — 연 45.1% 를 넣어도 한 해 상각이
     * 기초 장부가의 36.9% 에 그쳤다. 그해 취득한 자산은 기초 장부가가 취득가액이다(취득 앞 상각이 없다).
     */
    private BigDecimal monthlyAmount(FixedAsset asset, String fiscalYearStart) {
        BigDecimal remaining = asset.depreciableRemaining();
        if (remaining.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal raw = switch (asset.getMethod()) {
            case STRAIGHT_LINE -> asset.getAcquisitionCost().subtract(asset.getSalvageValue())
                    .divide(BigDecimal.valueOf(asset.getUsefulLifeYears()).multiply(MONTHS_PER_YEAR),
                            0, RoundingMode.HALF_UP);
            case DECLINING_BALANCE -> decliningMonthly(
                    asset.getAcquisitionCost().subtract(depreciationRepository.sumBefore(asset.getId(), fiscalYearStart)),
                    asset.getDeclineRate());
        };
        return raw.min(remaining);
    }

    /** 정률법 한 달 몫 = 기초 장부가 × 연 상각률(%) ÷ 12, 원 단위. */
    static BigDecimal decliningMonthly(BigDecimal openingBook, BigDecimal annualRatePct) {
        return openingBook.multiply(annualRatePct).divide(HUNDRED, 10, RoundingMode.HALF_UP)
                .divide(MONTHS_PER_YEAR, 0, RoundingMode.HALF_UP);
    }

    /** ym 이 속한 회계연도의 첫 달. 시작월이 4월이면 2026-03 → 2025-04, 2026-04 → 2026-04. */
    static YearMonth fiscalYearStart(YearMonth ym, int startMonth) {
        return ym.getMonthValue() >= startMonth ? YearMonth.of(ym.getYear(), startMonth) : YearMonth.of(ym.getYear() - 1, startMonth);
    }

    private int fiscalStartMonth() {
        try {
            int m = Integer.parseInt(preferenceService.get().fiscalStart().trim());
            return m >= 1 && m <= 12 ? m : 1;
        } catch (RuntimeException e) {
            return 1;
        }
    }

    private YearMonth parsePeriod(String period) {
        try {
            return YearMonth.parse(period);
        } catch (DateTimeParseException e) {
            throw ApiException.badRequest("귀속월 형식이 올바르지 않습니다(yyyy-MM): " + period);
        }
    }

    private Account assetAccount(Long id) {
        Account account = accountRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계정과목을 찾을 수 없습니다. id=" + id));
        if (account.getDivision() != com.erp.accounting.account.AccountDivision.ASSET) {
            throw ApiException.badRequest("고정자산은 자산 계정에만 등록할 수 있습니다: " + account.getName());
        }
        /*
         * 자산 계정이어도 현금·외상매출금·원재료(1xx 유동자산)는 감가상각할 자산이 아니다. 화면이 그것까지 골라 줘서
         * 현금 계정에 고정자산을 달 수 있었다(34회차). 비유동자산(2xx)만, 감가상각누계액(차감계정)은 빼고.
         */
        if (!account.getCode().startsWith("2") || account.getName().contains("누계")) {
            throw ApiException.badRequest("고정자산은 유형자산 계정(기계장치·차량운반구·비품 등 2xx)에만 등록할 수 있습니다: "
                    + account.getCode() + " " + account.getName());
        }
        return account;
    }
}

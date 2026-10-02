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

    @Transactional
    public AssetResponse create(CreateAssetRequest req, String username) {
        BigDecimal salvage = req.salvageValue() != null ? req.salvageValue() : BigDecimal.ZERO;
        if (salvage.compareTo(req.acquisitionCost()) >= 0) {
            throw ApiException.badRequest("잔존가액은 취득가액보다 작아야 합니다.");
        }
        if (req.method() == DepreciationMethod.DECLINING_BALANCE
                && (req.declineRate() == null || req.declineRate().signum() <= 0)) {
            throw ApiException.badRequest("정률법은 연 상각률(%)이 필요합니다.");
        }

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
        return AssetResponse.from(assetRepository.save(asset));
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

        for (FixedAsset asset : assetRepository.findByStatusWithAccount(AssetStatus.IN_USE)) {
            if (asset.getAcquisitionDate().isAfter(lastDay)) {          // 아직 취득 전
                skipped++;
                continue;
            }
            if (depreciationRepository.existsByAssetIdAndPeriod(asset.getId(), ym.toString())) {
                skipped++;
                continue;
            }
            BigDecimal amount = monthlyAmount(asset);
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

        asset.setStatus(AssetStatus.DISPOSED);
        asset.setDisposalDate(req.disposalDate());
        asset.setDisposalAmount(req.disposalAmount());
        journalService.createFromDisposal(asset);
        return AssetResponse.from(asset);
    }

    // ── 내부 ──────────────────────────────────────────────────────────

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
    /** 이번 달 상각액. 잔존가액 아래로는 내려가지 않도록 남은 상각가능액으로 자른다. */
    private BigDecimal monthlyAmount(FixedAsset asset) {
        BigDecimal remaining = asset.depreciableRemaining();
        if (remaining.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal raw = switch (asset.getMethod()) {
            case STRAIGHT_LINE -> asset.getAcquisitionCost().subtract(asset.getSalvageValue())
                    .divide(BigDecimal.valueOf(asset.getUsefulLifeYears()).multiply(MONTHS_PER_YEAR),
                            0, RoundingMode.HALF_UP);
            case DECLINING_BALANCE -> asset.bookValue()
                    .multiply(asset.getDeclineRate()).divide(HUNDRED, 10, RoundingMode.HALF_UP)
                    .divide(MONTHS_PER_YEAR, 0, RoundingMode.HALF_UP);
        };
        return raw.min(remaining);
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

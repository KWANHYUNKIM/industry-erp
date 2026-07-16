package com.erp.accounting.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.accounting.domain.Account;
import com.erp.accounting.domain.Depreciation;
import com.erp.accounting.domain.FixedAsset;
import com.erp.accounting.domain.JournalEntry;
import com.erp.accounting.domain.enums.AssetStatus;
import com.erp.accounting.domain.enums.DepreciationMethod;
import com.erp.accounting.dto.FixedAssetDtos.AssetResponse;
import com.erp.accounting.dto.FixedAssetDtos.CreateAssetRequest;
import com.erp.accounting.dto.FixedAssetDtos.DepreciationResponse;
import com.erp.accounting.dto.FixedAssetDtos.DepreciationRunResponse;
import com.erp.accounting.dto.FixedAssetDtos.DisposeRequest;
import com.erp.accounting.repository.AccountRepository;
import com.erp.accounting.repository.DepreciationRepository;
import com.erp.accounting.repository.FixedAssetRepository;
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
import com.erp.accounting.domain.AccountDivision;
import com.erp.accounting.dto.FixedAssetDtos;

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
        return assetRepository.findAllWithAccount().stream().map(AssetResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<DepreciationResponse> findDepreciations(String period) {
        List<Depreciation> rows = period != null && !period.isBlank()
                ? depreciationRepository.findByPeriodWithRefs(period)
                : depreciationRepository.findAllWithRefs();
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

            JournalEntry entry = journalService.createFromDepreciation(d);
            d.setJournalEntry(entry);
            done.add(DepreciationResponse.from(depreciationRepository.save(d)));
            total = total.add(amount);
        }
        return new DepreciationRunResponse(ym.toString(), done.size(), total, skipped, done);
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

        asset.setStatus(AssetStatus.DISPOSED);
        asset.setDisposalDate(req.disposalDate());
        asset.setDisposalAmount(req.disposalAmount());
        journalService.createFromDisposal(asset);
        return AssetResponse.from(asset);
    }

    // ── 내부 ──────────────────────────────────────────────────────────

    /** 이번 달 상각액. 잔존가액 아래로는 내려가지 않도록 남은 상각가능액으로 자른다. */
    private BigDecimal monthlyAmount(FixedAsset asset) {
        BigDecimal remaining = asset.depreciableRemaining();
        if (remaining.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal raw = switch (asset.getMethod()) {
            case STRAIGHT_LINE -> asset.getAcquisitionCost().subtract(asset.getSalvageValue())
                    .divide(BigDecimal.valueOf(asset.getUsefulLifeYears()).multiply(MONTHS_PER_YEAR),
                            2, RoundingMode.HALF_UP);
            case DECLINING_BALANCE -> asset.bookValue()
                    .multiply(asset.getDeclineRate()).divide(HUNDRED, 10, RoundingMode.HALF_UP)
                    .divide(MONTHS_PER_YEAR, 2, RoundingMode.HALF_UP);
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
        if (account.getDivision() != com.erp.accounting.domain.AccountDivision.ASSET) {
            throw ApiException.badRequest("고정자산은 자산 계정에만 등록할 수 있습니다: " + account.getName());
        }
        return account;
    }
}

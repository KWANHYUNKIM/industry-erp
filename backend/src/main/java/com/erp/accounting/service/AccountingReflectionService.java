package com.erp.accounting.service;

import com.erp.common.ApiException;
import com.erp.accounting.domain.JournalEntry;
import com.erp.accounting.domain.JournalSourceType;
import com.erp.accounting.repository.JournalEntryRepository;
import com.erp.trade.domain.Purchase;
import com.erp.trade.domain.Sales;
import com.erp.trade.domain.Settlement;
import com.erp.trade.repository.SettlementRepository;
import com.erp.accounting.dto.AccountingReflectionDtos.ReflectRequest;
import com.erp.accounting.dto.AccountingReflectionDtos.ReflectResult;
import com.erp.accounting.dto.AccountingReflectionDtos.SlipKind;
import com.erp.accounting.dto.AccountingReflectionDtos.SlipResponse;
import com.erp.trade.repository.PurchaseRepository;
import com.erp.trade.repository.SalesRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import com.erp.accounting.dto.AccountingReflectionDtos;

/** 판매/구매 전표의 회계반영 현황 조회 및 일괄반영. 반영 시 실제 회계전표(분개)를 생성한다. */
@Service
@RequiredArgsConstructor
public class AccountingReflectionService {

    private final SalesRepository salesRepository;
    private final PurchaseRepository purchaseRepository;
    private final SettlementRepository settlementRepository;
    private final JournalEntryRepository entryRepository;
    private final JournalService journalService;

    @Transactional(readOnly = true)
    public List<SlipResponse> list(SlipKind kind, boolean onlyUnreflected) {
        List<SlipResponse> slips = switch (kind) {
            case SALES -> salesRepository.findAllWithRefsAndLines().stream()
                    .map(SlipResponse::fromSales).toList();
            case PURCHASE -> purchaseRepository.findAllWithRefsAndLines().stream()
                    .map(SlipResponse::fromPurchase).toList();
            case SETTLEMENT -> settlementRepository.findAll().stream()
                    .map(SlipResponse::fromSettlement).toList();
        };
        if (onlyUnreflected) {
            return slips.stream().filter(s -> !s.reflected()).toList();
        }
        return withJournalNos(kind, slips);
    }

    /**
     * 원본 판매·구매일괄회계반영의 <b>[회계전표No.]</b> 열.
     *
     * <p>반영했다는 표시만 있고 <b>어느 분개가 됐는지가 없으면</b> 그 전표를 찾아갈 길이
     * 없다. 금액이 이상할 때 사람이 회계전표를 뒤져 짝을 맞춰야 했다.
     *
     * <p>출처(source_type, source_id)로 한 번에 끌어와 붙인다 — 줄마다 찾으면 N+1 이다.
     */
    private List<SlipResponse> withJournalNos(SlipKind kind, List<SlipResponse> slips) {
        List<Long> reflected = slips.stream().filter(SlipResponse::reflected)
                .map(SlipResponse::id).toList();
        if (reflected.isEmpty()) return slips;

        JournalSourceType source = switch (kind) {
            case SALES -> JournalSourceType.SALES;
            case PURCHASE -> JournalSourceType.PURCHASE;
            case SETTLEMENT -> JournalSourceType.SETTLEMENT;
        };
        Map<Long, JournalEntry> bySource = entryRepository
                .findBySourceTypeAndSourceIdIn(source, reflected).stream()
                .collect(Collectors.toMap(JournalEntry::getSourceId, e -> e, (a, b) -> a));

        return slips.stream().map(s -> {
            JournalEntry e = bySource.get(s.id());
            return e == null ? s : s.withJournal(e.getId(), e.getDocNo());
        }).toList();
    }

    @Transactional
    public ReflectResult reflect(ReflectRequest req) {
        if (req.ids().isEmpty()) {
            throw ApiException.badRequest("반영할 전표를 선택하세요.");
        }
        int count = 0;
        if (req.kind() == SlipKind.SETTLEMENT) {
            for (Settlement st : settlementRepository.findAllById(req.ids())) {
                if (!st.isAccountingReflected()) {
                    journalService.createFromSettlement(st);
                    st.setAccountingReflected(true);
                    count++;
                }
            }
        } else if (req.kind() == SlipKind.SALES) {
            List<Sales> targets = salesRepository.findAllById(req.ids());
            for (Sales s : targets) {
                if (!s.isAccountingReflected()) {
                    journalService.createFromSales(s);   // 실제 분개 생성
                    s.setAccountingReflected(true);
                    count++;
                }
            }
        } else {
            List<Purchase> targets = purchaseRepository.findAllById(req.ids());
            for (Purchase p : targets) {
                if (!p.isAccountingReflected()) {
                    journalService.createFromPurchase(p);
                    p.setAccountingReflected(true);
                    count++;
                }
            }
        }
        return new ReflectResult(count);
    }

    /** 회계반영 취소: 연결된 회계전표를 삭제하고 플래그를 내린다. */
    @Transactional
    public ReflectResult unreflect(ReflectRequest req) {
        if (req.ids().isEmpty()) {
            throw ApiException.badRequest("반영취소할 전표를 선택하세요.");
        }
        int count = 0;
        if (req.kind() == SlipKind.SETTLEMENT) {
            for (Settlement st : settlementRepository.findAllById(req.ids())) {
                if (st.isAccountingReflected()) {
                    journalService.deleteBySource(JournalSourceType.SETTLEMENT, st.getId());
                    st.setAccountingReflected(false);
                    count++;
                }
            }
        } else if (req.kind() == SlipKind.SALES) {
            for (Sales s : salesRepository.findAllById(req.ids())) {
                if (s.isAccountingReflected()) {
                    journalService.deleteBySource(JournalSourceType.SALES, s.getId());
                    s.setAccountingReflected(false);
                    count++;
                }
            }
        } else {
            for (Purchase p : purchaseRepository.findAllById(req.ids())) {
                if (p.isAccountingReflected()) {
                    journalService.deleteBySource(JournalSourceType.PURCHASE, p.getId());
                    p.setAccountingReflected(false);
                    count++;
                }
            }
        }
        return new ReflectResult(count);
    }
}

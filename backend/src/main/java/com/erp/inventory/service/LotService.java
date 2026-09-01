package com.erp.inventory.service;

import com.erp.common.ApiException;
import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.Lot;
import com.erp.inventory.domain.LotTransaction;
import com.erp.inventory.domain.Warehouse;
import com.erp.inventory.domain.enums.LotTxType;
import com.erp.inventory.dto.LotDtos.AdjustLotRequest;
import com.erp.inventory.dto.LotDtos.ConsumeLotRequest;
import com.erp.inventory.dto.LotDtos.CreateLotRequest;
import com.erp.inventory.dto.LotDtos.HoldLotRequest;
import com.erp.inventory.dto.LotDtos.LotResponse;
import com.erp.inventory.dto.LotDtos.LotTransactionResponse;
import com.erp.inventory.repository.ItemRepository;
import com.erp.inventory.repository.LotRepository;
import com.erp.inventory.repository.LotTransactionRepository;
import com.erp.inventory.repository.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.List;
import com.erp.inventory.dto.LotDtos;

@Service
@RequiredArgsConstructor
public class LotService {

    private final LotRepository lotRepository;
    private final ItemRepository itemRepository;
    private final WarehouseRepository warehouseRepository;
    private final LotTransactionRepository lotTxRepository;

    @Transactional(readOnly = true)
    public List<LotTransactionResponse> transactions() {
        return lotTxRepository.findAllWithRefs().stream()
                .map(LotTransactionResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<LotResponse> findAll() {
        return findAll(null);
    }

    /**
     * 로트 목록. <code>asOf</code> 를 주면 <b>그 날 시점의 잔량</b>으로 되돌린다
     * (원본 품목vs시리얼재고수량비교의 [기준일자]).
     *
     * <p>품목 재고를 asOf 로 되돌리는 방식과 같다 — <b>지금 잔량에서 그 뒤의 움직임을 뺀다.</b>
     * 품목 쪽만 되돌리고 로트는 오늘 것을 쓰면, 있지도 않은 차이가 표에 가득 찬다.
     */
    @Transactional(readOnly = true)
    public List<LotResponse> findAll(java.time.LocalDate asOf) {
        List<Lot> lots = lotRepository.findAllWithRefs();
        if (asOf == null) return lots.stream().map(LotResponse::from).toList();
        Map<Long, BigDecimal> after = new HashMap<>();
        for (Object[] r : lotTxRepository.sumChangeAfter(asOf)) {
            after.put((Long) r[0], (BigDecimal) r[1]);
        }
        return lots.stream()
                .map((l) -> LotResponse.from(l).withStockQty(
                        l.getStockQty().subtract(after.getOrDefault(l.getId(), BigDecimal.ZERO))))
                .toList();
    }

    @Transactional
    public LotResponse create(CreateLotRequest req) {
        if (lotRepository.existsByLotNo(req.lotNo())) {
            throw ApiException.conflict("이미 존재하는 로트No.입니다: " + req.lotNo());
        }
        Item item = itemRepository.findById(req.itemId())
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + req.itemId()));
        Warehouse warehouse = req.warehouseId() != null
                ? warehouseRepository.findById(req.warehouseId())
                    .orElseThrow(() -> ApiException.notFound("창고를 찾을 수 없습니다. id=" + req.warehouseId()))
                : null;

        Lot lot = Lot.builder()
                .lotNo(req.lotNo())
                .item(item)
                .warehouse(warehouse)
                .inboundDate(req.inboundDate() != null ? req.inboundDate() : LocalDate.now())
                .expireDate(req.expireDate())
                .inboundQty(req.inboundQty())
                .stockQty(req.inboundQty())
                .held(false)
                .build();
        Lot saved = lotRepository.save(lot);
        recordTx(saved, LotTxType.INBOUND, req.inboundQty(), saved.getStockQty(), "로트 입고 " + saved.getLotNo());
        return LotResponse.from(saved);
    }

    @Transactional
    public LotResponse consume(Long id, ConsumeLotRequest req) {
        Lot lot = getLot(id);
        if (lot.isHeld()) {
            throw ApiException.badRequest("보류 상태의 로트는 출고할 수 없습니다.");
        }
        if (req.qty().compareTo(lot.getStockQty()) > 0) {
            throw ApiException.badRequest(String.format(
                    "로트 재고가 부족합니다. 현재고 %s, 요청 %s",
                    lot.getStockQty().toPlainString(), req.qty().toPlainString()));
        }
        lot.setStockQty(lot.getStockQty().subtract(req.qty()));
        recordTx(lot, LotTxType.OUTBOUND, req.qty().negate(), lot.getStockQty(), "로트 소모");
        return LotResponse.from(lot);
    }

    /** 로트 실사 조정 — 실사수량으로 재고를 맞추고 차이를 조정 이력으로 남긴다. */
    @Transactional
    public LotResponse adjust(Long id, AdjustLotRequest req) {
        Lot lot = getLot(id);
        BigDecimal target = req.actualQty();
        if (target.signum() < 0) {
            throw ApiException.badRequest("실사수량은 0 이상이어야 합니다.");
        }
        BigDecimal delta = target.subtract(lot.getStockQty());
        if (delta.signum() == 0) {
            throw ApiException.badRequest("실사수량이 현재고와 같습니다. 조정할 차이가 없습니다.");
        }
        lot.setStockQty(target);
        String note = "로트 실사조정" + (req.note() != null && !req.note().isBlank() ? " (" + req.note() + ")" : "");
        recordTx(lot, LotTxType.ADJUST, delta, target, note);
        return LotResponse.from(lot);
    }

    @Transactional
    public LotResponse hold(Long id, HoldLotRequest req) {
        Lot lot = getLot(id);
        lot.setHeld(req.held());
        return LotResponse.from(lot);
    }

    private void recordTx(Lot lot, LotTxType type, BigDecimal change, BigDecimal balanceAfter, String note) {
        lotTxRepository.save(LotTransaction.builder()
                .lot(lot)
                .txDate(LocalDate.now())
                .type(type)
                .quantityChange(change)
                .balanceAfter(balanceAfter)
                .note(note)
                .build());
    }

    private Lot getLot(Long id) {
        return lotRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("로트를 찾을 수 없습니다. id=" + id));
    }
}

package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Item;
import com.erp.domain.Lot;
import com.erp.domain.Warehouse;
import com.erp.dto.LotDtos.ConsumeLotRequest;
import com.erp.dto.LotDtos.CreateLotRequest;
import com.erp.dto.LotDtos.HoldLotRequest;
import com.erp.dto.LotDtos.LotResponse;
import com.erp.repository.ItemRepository;
import com.erp.repository.LotRepository;
import com.erp.repository.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class LotService {

    private final LotRepository lotRepository;
    private final ItemRepository itemRepository;
    private final WarehouseRepository warehouseRepository;

    @Transactional(readOnly = true)
    public List<LotResponse> findAll() {
        return lotRepository.findAllWithRefs().stream()
                .map(LotResponse::from)
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
        return LotResponse.from(lotRepository.save(lot));
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
        return LotResponse.from(lot);
    }

    @Transactional
    public LotResponse hold(Long id, HoldLotRequest req) {
        Lot lot = getLot(id);
        lot.setHeld(req.held());
        return LotResponse.from(lot);
    }

    private Lot getLot(Long id) {
        return lotRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("로트를 찾을 수 없습니다. id=" + id));
    }
}

package com.erp.inventory.service;

import com.erp.common.ApiException;
import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.LocationStock;
import com.erp.inventory.domain.WarehouseLocation;
import com.erp.inventory.dto.StockDtos.StockResponse;
import com.erp.inventory.dto.WmsDtos.AllocationRow;
import com.erp.inventory.dto.WmsDtos.CreateLocationRequest;
import com.erp.inventory.dto.WmsDtos.LocationResponse;
import com.erp.inventory.dto.WmsDtos.LocationStockResponse;
import com.erp.inventory.dto.WmsDtos.MoveRequest;
import com.erp.inventory.dto.WmsDtos.PickRequest;
import com.erp.inventory.dto.WmsDtos.PutawayRequest;
import com.erp.inventory.dto.WmsDtos.UpdateLocationRequest;
import com.erp.inventory.dto.WmsDtos.WmsOverview;
import com.erp.inventory.repository.LocationStockRepository;
import com.erp.inventory.repository.WarehouseLocationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import com.erp.inventory.dto.StockDtos;
import com.erp.inventory.dto.WmsDtos;

/**
 * WMS. 창고 단위 재고(Stock)가 진실의 출처이고, 로케이션 배치는 그 재고를 창고 안
 * 어디에 두었는지 쪼갠 것이다.
 *
 * <p>불변식: 같은 (품목, 창고)에 대해 Σ 로케이션 배치 ≤ 창고 재고.
 * 남는 차이가 "미배치"이며, 입고했지만 아직 선반에 올리지 않은 물량이다.
 * 이 규칙을 깨고 로케이션 재고를 별도 진실로 두면 두 숫자는 반드시 갈라진다.
 */
@Service
@RequiredArgsConstructor
public class WmsService {

    private final WarehouseLocationRepository locationRepository;
    private final LocationStockRepository locationStockRepository;
    private final WarehouseService warehouseService;
    private final ItemService itemService;
    private final StockService stockService;

    @Transactional(readOnly = true)
    public WmsOverview overview() {
        List<LocationResponse> locations = locationRepository.findAllWithWarehouse().stream()
                .map(LocationResponse::from)
                .toList();
        List<LocationStockResponse> stocks = locationStockRepository.findAllWithRefs().stream()
                .map(LocationStockResponse::from)
                .toList();

        // 창고 재고 = 배치 + 미배치. 미배치가 남아 있으면 아직 선반에 안 올린 물량이다.
        List<AllocationRow> allocations = stockService.currentStock().stream()
                .map(this::toAllocation)
                .toList();

        return new WmsOverview(locations, stocks, allocations);
    }

    private AllocationRow toAllocation(StockResponse s) {
        BigDecimal allocated = locationStockRepository.sumByItemAndWarehouse(s.itemId(), s.warehouseId());
        return new AllocationRow(
                s.itemId(), s.itemCode(), s.itemName(), s.unit(),
                s.warehouseId(), s.warehouseName(),
                s.quantity(), allocated, s.quantity().subtract(allocated));
    }

    @Transactional
    public LocationResponse createLocation(CreateLocationRequest req) {
        String code = req.code().trim();
        if (locationRepository.existsByWarehouseIdAndCode(req.warehouseId(), code)) {
            throw ApiException.conflict("이미 존재하는 로케이션 코드입니다: " + code);
        }
        WarehouseLocation l = WarehouseLocation.builder()
                .warehouse(warehouseService.get(req.warehouseId()))
                .code(code)
                .zone(emptyToNull(req.zone()))
                .rack(emptyToNull(req.rack()))
                .level(emptyToNull(req.level()))
                .description(emptyToNull(req.description()))
                .active(true)
                .build();
        return LocationResponse.from(locationRepository.save(l));
    }

    @Transactional
    public LocationResponse updateLocation(Long id, UpdateLocationRequest req) {
        WarehouseLocation l = getLocation(id);
        l.setZone(emptyToNull(req.zone()));
        l.setRack(emptyToNull(req.rack()));
        l.setLevel(emptyToNull(req.level()));
        l.setDescription(emptyToNull(req.description()));
        if (req.active() != null) l.setActive(req.active());
        return LocationResponse.from(l);
    }

    /** 재고가 남아 있는 로케이션은 지울 수 없다. 지우면 그 물량이 어디 있는지 알 수 없게 된다. */
    @Transactional
    public void deleteLocation(Long id) {
        WarehouseLocation l = getLocation(id);
        if (locationStockRepository.existsByLocationIdAndQuantityGreaterThan(id, BigDecimal.ZERO)) {
            throw ApiException.conflict("재고가 배치된 로케이션은 삭제할 수 없습니다. 먼저 다른 곳으로 옮기세요.");
        }
        // 다 비운 선반에는 수량 0 행이 남아 있을 수 있다. 빈 행은 FK 때문에 먼저 지운다.
        locationStockRepository.deleteAll(locationStockRepository.findByLocationId(id));
        locationRepository.delete(l);
    }

    /** 적치: 미배치 물량을 선반에 올린다. 창고 재고를 넘겨 올릴 수는 없다. */
    @Transactional
    public LocationStockResponse putaway(PutawayRequest req) {
        BigDecimal qty = positive(req.quantity());
        WarehouseLocation location = getActiveLocation(req.locationId());
        Item item = itemService.get(req.itemId());
        Long warehouseId = location.getWarehouse().getId();

        BigDecimal stock = stockService.quantityOf(item.getId(), warehouseId);
        BigDecimal allocated = locationStockRepository.sumByItemAndWarehouse(item.getId(), warehouseId);
        BigDecimal unallocated = stock.subtract(allocated);
        if (qty.compareTo(unallocated) > 0) {
            throw ApiException.badRequest(String.format(
                    "미배치 수량을 초과했습니다. %s 창고 재고 %s, 이미 배치 %s → 배치 가능 %s",
                    item.getName(), stock.toPlainString(), allocated.toPlainString(), unallocated.toPlainString()));
        }
        return LocationStockResponse.from(add(location, item, qty));
    }

    /** 선반 사이 이동. 같은 창고 안에서만 옮긴다(창고를 넘는 이동은 재고이동 전표다). */
    @Transactional
    public List<LocationStockResponse> move(MoveRequest req) {
        BigDecimal qty = positive(req.quantity());
        WarehouseLocation from = getLocation(req.fromLocationId());
        WarehouseLocation to = getActiveLocation(req.toLocationId());
        if (from.getId().equals(to.getId())) {
            throw ApiException.badRequest("출발 로케이션과 도착 로케이션이 같습니다.");
        }
        if (!from.getWarehouse().getId().equals(to.getWarehouse().getId())) {
            throw ApiException.badRequest("창고가 다른 로케이션으로는 옮길 수 없습니다. 창고 간 이동은 기타이동(창고이동)으로 하세요.");
        }
        Item item = itemService.get(req.itemId());

        LocationStock source = subtract(from, item, qty);
        LocationStock target = add(to, item, qty);
        return List.of(LocationStockResponse.from(source), LocationStockResponse.from(target));
    }

    /** 피킹: 선반에서 내린다. 창고 재고는 그대로고 미배치로 돌아간다. */
    @Transactional
    public LocationStockResponse pick(PickRequest req) {
        BigDecimal qty = positive(req.quantity());
        WarehouseLocation location = getLocation(req.locationId());
        Item item = itemService.get(req.itemId());
        return LocationStockResponse.from(subtract(location, item, qty));
    }

    private LocationStock add(WarehouseLocation location, Item item, BigDecimal qty) {
        LocationStock s = locationStockRepository
                .findByLocationIdAndItemId(location.getId(), item.getId())
                .orElseGet(() -> locationStockRepository.save(LocationStock.builder()
                        .location(location)
                        .item(item)
                        .quantity(BigDecimal.ZERO)
                        .build()));
        s.setQuantity(s.getQuantity().add(qty));
        return s;
    }

    private LocationStock subtract(WarehouseLocation location, Item item, BigDecimal qty) {
        LocationStock s = locationStockRepository
                .findByLocationIdAndItemId(location.getId(), item.getId())
                .orElseThrow(() -> ApiException.badRequest(
                        location.getCode() + " 로케이션에 " + item.getName() + " 재고가 없습니다."));
        if (s.getQuantity().compareTo(qty) < 0) {
            throw ApiException.badRequest(String.format(
                    "%s 로케이션의 %s 재고가 부족합니다. 보유 %s, 요청 %s",
                    location.getCode(), item.getName(),
                    s.getQuantity().toPlainString(), qty.toPlainString()));
        }
        s.setQuantity(s.getQuantity().subtract(qty));
        return s;
    }

    private WarehouseLocation getActiveLocation(Long id) {
        WarehouseLocation l = getLocation(id);
        if (!l.isActive()) {
            throw ApiException.badRequest("사용하지 않는 로케이션입니다: " + l.getCode());
        }
        return l;
    }

    private WarehouseLocation getLocation(Long id) {
        return locationRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("로케이션을 찾을 수 없습니다. id=" + id));
    }

    private BigDecimal positive(BigDecimal qty) {
        if (qty == null || qty.signum() <= 0) {
            throw ApiException.badRequest("수량은 0보다 커야 합니다.");
        }
        return qty;
    }

    private String emptyToNull(String v) {
        return (v == null || v.isBlank()) ? null : v.trim();
    }
}

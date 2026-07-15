package com.erp.controller;

import com.erp.dto.WmsDtos.CreateLocationRequest;
import com.erp.dto.WmsDtos.LocationResponse;
import com.erp.dto.WmsDtos.LocationStockResponse;
import com.erp.dto.WmsDtos.MoveRequest;
import com.erp.dto.WmsDtos.PickRequest;
import com.erp.dto.WmsDtos.PutawayRequest;
import com.erp.dto.WmsDtos.UpdateLocationRequest;
import com.erp.dto.WmsDtos.WmsOverview;
import com.erp.service.WmsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** WMS — 창고 로케이션과 로케이션별 재고 배치 (재고 II > WMS) */
@RestController
@RequestMapping("/api/wms")
@RequiredArgsConstructor
public class WmsController {

    private final WmsService service;

    /** 로케이션 · 로케이션 재고 · (품목,창고)별 배치/미배치 현황 */
    @GetMapping
    public WmsOverview overview() {
        return service.overview();
    }

    @PostMapping("/locations")
    public ResponseEntity<LocationResponse> createLocation(@Valid @RequestBody CreateLocationRequest req) {
        return ResponseEntity.ok(service.createLocation(req));
    }

    @PutMapping("/locations/{id}")
    public LocationResponse updateLocation(@PathVariable Long id, @RequestBody UpdateLocationRequest req) {
        return service.updateLocation(id, req);
    }

    @DeleteMapping("/locations/{id}")
    public ResponseEntity<Void> deleteLocation(@PathVariable Long id) {
        service.deleteLocation(id);
        return ResponseEntity.noContent().build();
    }

    /** 적치 (미배치 → 로케이션) */
    @PostMapping("/putaway")
    public LocationStockResponse putaway(@Valid @RequestBody PutawayRequest req) {
        return service.putaway(req);
    }

    /** 로케이션 간 이동 (같은 창고 안) */
    @PostMapping("/move")
    public List<LocationStockResponse> move(@Valid @RequestBody MoveRequest req) {
        return service.move(req);
    }

    /** 피킹 (로케이션 → 미배치) */
    @PostMapping("/pick")
    public LocationStockResponse pick(@Valid @RequestBody PickRequest req) {
        return service.pick(req);
    }
}

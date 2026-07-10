package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Item;
import com.erp.domain.Warehouse;
import com.erp.domain.WorkOrder;
import com.erp.dto.ProductionDtos.CreateWorkOrderRequest;
import com.erp.dto.ProductionDtos.WorkOrderResponse;
import com.erp.repository.ItemRepository;
import com.erp.repository.WarehouseRepository;
import com.erp.repository.WorkOrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@RequiredArgsConstructor
public class WorkOrderService {

    private final WorkOrderRepository workOrderRepository;
    private final ItemRepository itemRepository;
    private final WarehouseRepository warehouseRepository;

    @Transactional(readOnly = true)
    public List<WorkOrderResponse> findAll() {
        return workOrderRepository.findAllWithRefs().stream()
                .map(WorkOrderResponse::from)
                .toList();
    }

    @Transactional
    public WorkOrderResponse create(CreateWorkOrderRequest req, String username) {
        Item product = itemRepository.findById(req.productId())
                .orElseThrow(() -> ApiException.notFound("제품을 찾을 수 없습니다. id=" + req.productId()));
        Warehouse warehouse = warehouseRepository.findById(req.warehouseId())
                .orElseThrow(() -> ApiException.notFound("창고를 찾을 수 없습니다. id=" + req.warehouseId()));

        LocalDate orderDate = req.orderDate() != null ? req.orderDate() : LocalDate.now();

        WorkOrder wo = WorkOrder.builder()
                .orderNo(generateOrderNo(orderDate))
                .product(product)
                .warehouse(warehouse)
                .plannedQty(req.plannedQty())
                .orderDate(orderDate)
                .dueDate(req.dueDate())
                .remark(req.remark())
                .createdBy(username)
                .build();

        return WorkOrderResponse.from(workOrderRepository.save(wo));
    }

    private String generateOrderNo(LocalDate date) {
        String d = date.format(DateTimeFormatter.BASIC_ISO_DATE);
        return "WO-" + d + "-" + String.format("%04d", workOrderRepository.count() + 1);
    }
}

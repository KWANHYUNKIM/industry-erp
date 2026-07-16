package com.erp.production.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.Warehouse;
import com.erp.production.domain.WorkOrder;
import com.erp.production.dto.ProductionDtos.CreateWorkOrderRequest;
import com.erp.production.dto.ProductionDtos.WorkOrderResponse;
import com.erp.inventory.repository.ItemRepository;
import com.erp.inventory.repository.WarehouseRepository;
import com.erp.production.repository.WorkOrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.production.dto.ProductionDtos;

@Service
@RequiredArgsConstructor
public class WorkOrderService {

    private final WorkOrderRepository workOrderRepository;
    private final ItemRepository itemRepository;
    private final WarehouseRepository warehouseRepository;
    private final DocumentNoGenerator docNoGenerator;

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
        return docNoGenerator.next("WO-", "work_orders", "order_no", "order_date", date);
    }
}

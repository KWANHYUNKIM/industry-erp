package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.OrderStage;
import com.erp.dto.OrderStageDtos.CreateOrderStageRequest;
import com.erp.dto.OrderStageDtos.OrderStageResponse;
import com.erp.dto.OrderStageDtos.UpdateOrderStageRequest;
import com.erp.repository.OrderStageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class OrderStageService {

    private final OrderStageRepository orderStageRepository;

    @Transactional(readOnly = true)
    public List<OrderStageResponse> findAll() {
        return orderStageRepository.findAll(Sort.by(Sort.Direction.ASC, "sortOrder")).stream()
                .map(OrderStageResponse::from)
                .toList();
    }

    @Transactional
    public OrderStageResponse create(CreateOrderStageRequest req) {
        if (orderStageRepository.existsByCode(req.code())) {
            throw ApiException.conflict("이미 존재하는 단계코드입니다: " + req.code());
        }
        OrderStage s = OrderStage.builder()
                .code(req.code())
                .name(req.name())
                .sortOrder(req.sortOrder())
                .active(true)
                .build();
        return OrderStageResponse.from(orderStageRepository.save(s));
    }

    @Transactional
    public OrderStageResponse update(Long id, UpdateOrderStageRequest req) {
        OrderStage s = getOrderStage(id);
        s.setName(req.name());
        s.setSortOrder(req.sortOrder());
        if (req.active() != null) {
            s.setActive(req.active());
        }
        return OrderStageResponse.from(s);
    }

    @Transactional
    public void delete(Long id) {
        orderStageRepository.delete(getOrderStage(id));
    }

    private OrderStage getOrderStage(Long id) {
        return orderStageRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("진행단계를 찾을 수 없습니다. id=" + id));
    }
}

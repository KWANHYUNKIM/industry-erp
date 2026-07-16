package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.trade.domain.OrderStage;
import com.erp.trade.dto.OrderStageDtos.CreateOrderStageRequest;
import com.erp.trade.dto.OrderStageDtos.OrderStageResponse;
import com.erp.trade.dto.OrderStageDtos.UpdateOrderStageRequest;
import com.erp.trade.repository.OrderStageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.trade.dto.OrderStageDtos;

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

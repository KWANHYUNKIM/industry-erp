package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.trade.domain.OrderType;
import com.erp.trade.dto.OrderTypeDtos.CreateOrderTypeRequest;
import com.erp.trade.dto.OrderTypeDtos.OrderTypeResponse;
import com.erp.trade.dto.OrderTypeDtos.UpdateOrderTypeRequest;
import com.erp.trade.repository.OrderTypeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.trade.dto.OrderTypeDtos;

@Service
@RequiredArgsConstructor
public class OrderTypeService {

    private final OrderTypeRepository orderTypeRepository;

    @Transactional(readOnly = true)
    public List<OrderTypeResponse> findAll() {
        return orderTypeRepository.findAll(Sort.by(Sort.Direction.ASC, "code")).stream()
                .map(OrderTypeResponse::from)
                .toList();
    }

    @Transactional
    public OrderTypeResponse create(CreateOrderTypeRequest req) {
        if (orderTypeRepository.existsByCode(req.code())) {
            throw ApiException.conflict("이미 존재하는 유형코드입니다: " + req.code());
        }
        OrderType t = OrderType.builder()
                .code(req.code())
                .name(req.name())
                .description(req.description())
                .active(true)
                .build();
        return OrderTypeResponse.from(orderTypeRepository.save(t));
    }

    @Transactional
    public OrderTypeResponse update(Long id, UpdateOrderTypeRequest req) {
        OrderType t = getOrderType(id);
        t.setName(req.name());
        t.setDescription(req.description());
        if (req.active() != null) {
            t.setActive(req.active());
        }
        return OrderTypeResponse.from(t);
    }

    @Transactional
    public void delete(Long id) {
        orderTypeRepository.delete(getOrderType(id));
    }

    private OrderType getOrderType(Long id) {
        return orderTypeRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("오더유형을 찾을 수 없습니다. id=" + id));
    }
}

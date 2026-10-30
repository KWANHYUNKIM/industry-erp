package com.erp.trade.ordertype;

import com.erp.common.ApiException;
import com.erp.trade.ordertype.dto.OrderNumberDtos.CreateOrderNumberRequest;
import com.erp.trade.ordertype.dto.OrderNumberDtos.OrderNumberResponse;
import com.erp.trade.ordertype.dto.OrderNumberDtos.UpdateOrderNumberRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class OrderNumberService {

    private final OrderNumberRepository orderNumberRepository;
    private final OrderTypeRepository orderTypeRepository;

    @Transactional(readOnly = true)
    public List<OrderNumberResponse> findAll(LocalDate from, LocalDate to) {
        return orderNumberRepository.findAllWithType().stream()
                .filter(o -> from == null || !o.getCreatedDate().isBefore(from))
                .filter(o -> to == null || !o.getCreatedDate().isAfter(to))
                .map(OrderNumberResponse::from).toList();
    }

    /**
     * 원본 창이 열릴 때 번호 칸에 미리 찍는 다음 번호(00027). 다섯 자리 숫자 번호만 센다 —
     * 손으로 넣은 00023_202610 · ABCDE 같은 번호는 차례를 흔들지 않는다.
     */
    @Transactional(readOnly = true)
    public String nextNo() {
        int n = orderNumberRepository.findPlainNos().stream()
                .filter(no -> no.chars().allMatch(Character::isDigit))
                .mapToInt(Integer::parseInt).max().orElse(0);
        return String.format("%05d", n + 1);
    }

    /** 원본 번호 칸 [Fn ▸ 중복확인]. */
    @Transactional(readOnly = true)
    public boolean exists(String orderNo) {
        return orderNo != null && orderNumberRepository.existsByOrderNo(orderNo.trim());
    }

    @Transactional
    public OrderNumberResponse create(CreateOrderNumberRequest req) {
        OrderType type = orderTypeRepository.findById(req.orderTypeId())
                .orElseThrow(() -> ApiException.badRequest("오더관리유형을 찾을 수 없습니다. id=" + req.orderTypeId()));
        /* 원본(2026-10-30 실측): 신규 창의 번호 칸은 다음 번호가 미리 찍힌 채 고칠 수 있다(00023_202610 처럼).
           비우면 다음 번호, 이미 있으면 원본 [중복확인] 의 '이미 등록된 코드입니다.' */
        String no = req.orderNo() == null || req.orderNo().isBlank() ? nextNo() : req.orderNo().trim();
        if (orderNumberRepository.existsByOrderNo(no)) {
            throw ApiException.conflict("이미 등록된 코드입니다. (오더관리번호 " + no + ")");
        }
        OrderNumber o = orderNumberRepository.save(OrderNumber.builder()
                .orderNo(no)
                .name(req.name().trim())
                .orderType(type)
                .createdDate(req.createdDate() != null ? req.createdDate() : LocalDate.now())
                .remarks1(req.remarks1()).remarks2(req.remarks2()).searchKeyword(req.searchKeyword())
                .build());
        return OrderNumberResponse.from(o);
    }

    @Transactional
    public OrderNumberResponse update(Long id, UpdateOrderNumberRequest req) {
        OrderNumber o = get(id);
        o.setName(req.name().trim());
        if (req.createdDate() != null) {
            o.setCreatedDate(req.createdDate());
        }
        o.setRemarks1(req.remarks1());
        o.setRemarks2(req.remarks2());
        o.setSearchKeyword(req.searchKeyword());
        if (req.active() != null) {
            o.setActive(req.active());
        }
        return OrderNumberResponse.from(o);
    }

    /** 원본 [전체단계완료] — '선택한 오더관리번호를 종결 하겠습니까?' 확인 뒤 진행상태 완료. */
    @Transactional
    public void complete(List<Long> ids) {
        for (Long id : ids) {
            get(id).setCompleted(true);
        }
    }

    /** 원본 확인 '삭제하겠습니까?' — 연결된 전표는 지우지 않고 오더관리번호만 지운다. */
    @Transactional
    public void delete(Long id) {
        orderNumberRepository.delete(get(id));
    }

    private OrderNumber get(Long id) {
        return orderNumberRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("오더관리번호를 찾을 수 없습니다. id=" + id));
    }
}

package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.trade.domain.OrderType;
import com.erp.trade.dto.OrderTypeDtos.CreateOrderTypeRequest;
import com.erp.trade.dto.OrderTypeDtos.OrderTypeResponse;
import com.erp.trade.dto.OrderTypeDtos.UpdateOrderTypeRequest;
import com.erp.trade.domain.OrderStage;
import com.erp.trade.domain.OrderTypeStep;
import com.erp.trade.repository.OrderStageRepository;
import com.erp.trade.repository.OrderTypeRepository;
import com.erp.trade.repository.OrderTypeStepRepository;
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
    private final OrderTypeStepRepository stepRepository;
    private final OrderStageRepository stageRepository;

    /** 원본 유형리스트의 열이 [1단계]~[10단계] 라 10 이 상한이다. */
    private static final int MAX_STEPS = 10;

    @Transactional(readOnly = true)
    public List<OrderTypeResponse> findAll() {
        // 단계는 한 번에 읽어 유형별로 나눈다 — 유형마다 조회하면 N+1 이다.
        java.util.Map<Long, List<OrderTypeStep>> byType = new java.util.HashMap<>();
        for (OrderTypeStep s : stepRepository.findAllWithStage()) {
            byType.computeIfAbsent(s.getOrderType().getId(), k -> new java.util.ArrayList<>()).add(s);
        }
        return orderTypeRepository.findAll(Sort.by(Sort.Direction.ASC, "code")).stream()
                .map(t -> OrderTypeResponse.from(t, byType.getOrDefault(t.getId(), List.of())))
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
                .useInInput(req.useInInput() == null || req.useInInput())
                .manager(req.manager())
                .active(true)
                .build();
        OrderType saved = orderTypeRepository.save(t);
        return OrderTypeResponse.from(saved, replaceSteps(saved, req.stageIds()));
    }

    @Transactional
    public OrderTypeResponse update(Long id, UpdateOrderTypeRequest req) {
        OrderType t = getOrderType(id);
        t.setName(req.name());
        t.setDescription(req.description());
        if (req.useInInput() != null) {
            t.setUseInInput(req.useInInput());
        }
        t.setManager(req.manager());
        if (req.active() != null) {
            t.setActive(req.active());
        }
        // 단계를 안 주면 그대로 둔다(이름만 고치는 수정이 단계를 날리면 안 된다).
        List<OrderTypeStep> steps = req.stageIds() == null
                ? stepRepository.findByTypeWithStage(id)
                : replaceSteps(t, req.stageIds());
        return OrderTypeResponse.from(t, steps);
    }

    @Transactional
    public void delete(Long id) {
        OrderType t = getOrderType(id);
        stepRepository.deleteByOrderType_Id(id);
        orderTypeRepository.delete(t);
    }

    /**
     * 유형의 단계를 통째로 갈아 끼운다.
     *
     * <p>부분 수정을 지원하지 않는 이유: 단계는 <b>순서가 곧 뜻</b>이라, 가운데 한 칸만 바꾸면
     * 나머지 순번이 어긋난다. 화면도 원본처럼 1~10칸을 한 번에 저장한다.
     */
    private List<OrderTypeStep> replaceSteps(OrderType type, List<Long> stageIds) {
        stepRepository.deleteByOrderType_Id(type.getId());
        /*
         * 지운 것을 <b>DB 까지 밀어 넣고</b> 새로 넣는다.
         *
         * <p>(order_type_id, seq) 에 유니크 인덱스가 있다(uq_order_type_steps_seq).
         * 영속성 컨텍스트는 delete 를 미뤄 두었다가 flush 시점에 함께 보내는데,
         * 그러면 같은 seq 의 insert 가 delete 보다 먼저 나가 제약에 걸린다.
         * 그래서 <b>단계가 이미 있는 유형을 다시 저장하면 409 로 막혔다</b> —
         * 화면에서 단계를 고칠 수가 없었다.
         */
        stepRepository.flush();
        if (stageIds == null || stageIds.isEmpty()) {
            return List.of();
        }
        if (stageIds.size() > MAX_STEPS) {
            throw ApiException.badRequest("단계는 최대 " + MAX_STEPS + "개까지입니다.");
        }
        if (new java.util.HashSet<>(stageIds).size() != stageIds.size()) {
            throw ApiException.badRequest("같은 단계를 두 번 넣을 수 없습니다.");
        }
        List<OrderTypeStep> saved = new java.util.ArrayList<>();
        int seq = 1;
        for (Long stageId : stageIds) {
            OrderStage stage = stageRepository.findById(stageId)
                    .orElseThrow(() -> ApiException.badRequest("진행단계를 찾을 수 없습니다. id=" + stageId));
            saved.add(stepRepository.save(OrderTypeStep.builder()
                    .orderType(type).seq(seq++).stage(stage).build()));
        }
        return saved;
    }

    private OrderType getOrderType(Long id) {
        return orderTypeRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("오더유형을 찾을 수 없습니다. id=" + id));
    }
}

package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.MallOrder;
import com.erp.domain.enums.MallOrderStatus;
import com.erp.dto.MallOrderDtos.CollectOrderRequest;
import com.erp.dto.MallOrderDtos.ConvertRequest;
import com.erp.dto.MallOrderDtos.MallOrderResponse;
import com.erp.dto.MallOrderDtos.MallOverview;
import com.erp.dto.MallOrderDtos.MallSummary;
import com.erp.dto.MallOrderDtos.MapItemRequest;
import com.erp.dto.SalesDtos.CreateSalesRequest;
import com.erp.dto.SalesDtos.SalesLineRequest;
import com.erp.dto.SalesDtos.SalesResponse;
import com.erp.repository.MallOrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 쇼핑몰 주문. 외부몰에서 수집한 주문을 확인하고 판매전표로 전환한다.
 *
 * <p>재고 차감과 채권 계상은 판매전표(SalesService)가 한다. 쇼핑몰이 재고를 직접 건드리면
 * 같은 사실을 두 곳이 기록하게 되고, 두 숫자는 반드시 갈라진다.
 */
@Service
@RequiredArgsConstructor
public class MallOrderService {

    private final MallOrderRepository orderRepository;
    private final ItemService itemService;
    private final SalesService salesService;

    @Transactional(readOnly = true)
    public MallOverview overview() {
        List<MallOrder> orders = orderRepository.findAllWithRefs();
        List<MallOrderResponse> rows = orders.stream().map(MallOrderResponse::from).toList();

        Map<String, MallSummary> byMall = new LinkedHashMap<>();
        for (MallOrderResponse o : rows) {
            MallSummary prev = byMall.get(o.mall());
            int count = (prev != null ? prev.orderCount() : 0) + 1;
            BigDecimal amount = (prev != null ? prev.totalAmount() : BigDecimal.ZERO).add(o.totalAmount());
            int unconverted = (prev != null ? prev.unconverted() : 0)
                    + (o.status() == MallOrderStatus.CONVERTED || o.status() == MallOrderStatus.CANCELLED ? 0 : 1);
            byMall.put(o.mall(), new MallSummary(o.mall(), count, amount, unconverted));
        }

        return new MallOverview(
                rows.size(),
                rows.stream().map(MallOrderResponse::totalAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                (int) rows.stream().filter(o -> o.itemId() == null && o.status() != MallOrderStatus.CANCELLED).count(),
                (int) rows.stream().filter(o -> o.status() == MallOrderStatus.RECEIVED
                        || o.status() == MallOrderStatus.CONFIRMED).count(),
                new ArrayList<>(byMall.values()),
                rows);
    }

    /** 주문 수집. 몰 API 연동이 붙기 전까지 이 진입점이 그 자리다. */
    @Transactional
    public MallOrderResponse collect(CollectOrderRequest req, String username) {
        if (req.quantity().signum() <= 0) {
            throw ApiException.badRequest("수량은 0보다 커야 합니다.");
        }
        if (req.unitPrice().signum() < 0) {
            throw ApiException.badRequest("단가는 0 이상이어야 합니다.");
        }
        // 같은 주문을 두 번 수집하면 판매도 재고도 두 번 잡힌다.
        if (orderRepository.existsByMallAndMallOrderNo(req.mall().trim(), req.mallOrderNo().trim())) {
            throw ApiException.conflict("이미 수집된 주문입니다: " + req.mall() + " / " + req.mallOrderNo());
        }

        MallOrder o = MallOrder.builder()
                .mall(req.mall().trim())
                .mallOrderNo(req.mallOrderNo().trim())
                .orderDate(req.orderDate())
                .status(MallOrderStatus.RECEIVED)
                .buyerName(req.buyerName().trim())
                .buyerPhone(req.buyerPhone())
                .address(req.address())
                .productName(req.productName().trim())
                .item(req.itemId() != null ? itemService.get(req.itemId()) : null)
                .quantity(req.quantity())
                .unitPrice(req.unitPrice())
                .totalAmount(req.quantity().multiply(req.unitPrice()))
                .remark(req.remark())
                .createdBy(username)
                .build();
        return MallOrderResponse.from(orderRepository.save(o));
    }

    /** 몰 상품 ↔ 우리 품목 매핑. 전환 전에만 바꿀 수 있다. */
    @Transactional
    public MallOrderResponse mapItem(Long id, MapItemRequest req) {
        MallOrder o = getOpen(id);
        o.setItem(itemService.get(req.itemId()));
        return MallOrderResponse.from(o);
    }

    /** 수집 → 확인 */
    @Transactional
    public MallOrderResponse confirm(Long id) {
        MallOrder o = getOpen(id);
        if (o.getStatus() != MallOrderStatus.RECEIVED) {
            throw ApiException.conflict("수집 상태의 주문만 확인할 수 있습니다. 현재: " + o.getStatus().getDisplayName());
        }
        o.setStatus(MallOrderStatus.CONFIRMED);
        return MallOrderResponse.from(o);
    }

    @Transactional
    public MallOrderResponse cancel(Long id) {
        MallOrder o = getOpen(id);
        o.setStatus(MallOrderStatus.CANCELLED);
        return MallOrderResponse.from(o);
    }

    /**
     * 판매전환. 판매전표를 만들고 연결한다. 재고 차감·채권 계상은 판매전표가 한다.
     * 품목 매핑이 없으면 무엇을 팔았는지 모르는 채로 재고를 깎게 되므로 거부한다.
     */
    @Transactional
    public SalesResponse convert(Long id, ConvertRequest req, String username) {
        MallOrder o = getOpen(id);
        if (o.getStatus() != MallOrderStatus.CONFIRMED) {
            throw ApiException.conflict("확인된 주문만 판매전환할 수 있습니다. 현재: " + o.getStatus().getDisplayName());
        }
        if (o.getItem() == null) {
            throw ApiException.badRequest("몰 상품이 품목과 매핑되지 않았습니다: " + o.getProductName());
        }

        SalesResponse sales = salesService.create(new CreateSalesRequest(
                req.partnerId(),
                req.warehouseId(),
                o.getOrderDate(),
                req.taxable() != null ? req.taxable() : Boolean.TRUE,
                o.getMall() + " 주문 " + o.getMallOrderNo() + " (" + o.getBuyerName() + ")",
                null,   // 몰 주문에는 프로젝트 개념이 없다
                List.of(new SalesLineRequest(o.getItem().getId(), o.getQuantity(), o.getUnitPrice()))
        ), username);

        o.setStatus(MallOrderStatus.CONVERTED);
        o.setSales(salesService.get(sales.id()));
        return sales;
    }

    /** 전환·취소된 주문은 더 이상 손대지 않는다. 판매전표가 이미 재고를 움직였기 때문이다. */
    private MallOrder getOpen(Long id) {
        MallOrder o = get(id);
        if (o.getStatus() == MallOrderStatus.CONVERTED) {
            throw ApiException.conflict("이미 판매전환된 주문입니다: " + o.getMallOrderNo());
        }
        if (o.getStatus() == MallOrderStatus.CANCELLED) {
            throw ApiException.conflict("취소된 주문입니다: " + o.getMallOrderNo());
        }
        return o;
    }

    private MallOrder get(Long id) {
        return orderRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("몰 주문을 찾을 수 없습니다. id=" + id));
    }
}

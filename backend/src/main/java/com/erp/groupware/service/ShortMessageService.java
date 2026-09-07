package com.erp.groupware.service;

import com.erp.auth.domain.User;
import com.erp.auth.repository.UserRepository;
import com.erp.common.ApiException;
import com.erp.groupware.domain.ShortMessage;
import com.erp.groupware.dto.ShortMessageDtos.SendShortMessageRequest;
import com.erp.groupware.dto.ShortMessageDtos.ShortMessageResponse;
import com.erp.groupware.repository.ShortMessageRepository;
import com.erp.trade.domain.BusinessPartner;
import com.erp.trade.service.PartnerService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 쪽지(E010851 쪽지수발신내역 · C000663 커뮤니케이션센터).
 *
 * 함(box)은 다섯 가지다 — 받은쪽지(전체)·미확인·확인·보관함·보낸쪽지.
 * 확인/보관/삭제는 그 쪽지의 당사자만 할 수 있다. 남의 쪽지를 대신 확인 처리하면
 * "아무도 안 본 알림"이 조용히 사라진다(메일과 같은 이유).
 *
 * {@link #notify} 는 시스템 자동알림 진입점이다. 보낸 사람 없이(sender=null) 쪽지를 만들며,
 * 전자결재 완료·반려 같은 사건에서 호출한다.
 */
@Service
@RequiredArgsConstructor
public class ShortMessageService {

    /** 날짜 파라미터 미지정 시 쓰는 넓은 기본값(PostgreSQL 42P18 회피 — 항상 non-null 로 넘긴다). */
    private static final LocalDate MIN_DATE = LocalDate.of(1900, 1, 1);
    private static final LocalDate MAX_DATE = LocalDate.of(2999, 12, 31);

    private final ShortMessageRepository repository;
    private final UserRepository userRepository;
    private final PartnerService partnerService;

    /**
     * 함별 조회.
     *
     * @param box received(받은쪽지 전체) · unread · read · archived · sent
     */
    @Transactional(readOnly = true)
    public List<ShortMessageResponse> search(String box, LocalDate from, LocalDate to,
                                             Long senderId, Long recipientId, Long partnerId,
                                             String keyword, String username) {
        User me = me(username);
        LocalDateTime start = (from != null ? from : MIN_DATE).atStartOfDay();
        LocalDateTime end = (to != null ? to : MAX_DATE).atTime(23, 59, 59);
        String bx = box == null ? "received" : box;

        List<ShortMessage> base = "sent".equals(bx)
                ? repository.findSent(me.getId(), start, end)
                : repository.findReceived(me.getId(), start, end);

        return base.stream()
                .filter(m -> matchesBox(m, bx))
                .filter(m -> senderId == null || (m.getSender() != null && m.getSender().getId().equals(senderId)))
                .filter(m -> recipientId == null || m.getRecipient().getId().equals(recipientId))
                .filter(m -> partnerId == null || (m.getPartner() != null && m.getPartner().getId().equals(partnerId)))
                .filter(m -> !StringUtils.hasText(keyword) || m.getContent().contains(keyword.trim()))
                .map(ShortMessageResponse::from)
                .toList();
    }

    private boolean matchesBox(ShortMessage m, String box) {
        return switch (box) {
            case "unread" -> !m.isArchived() && m.getReadAt() == null;
            case "read" -> !m.isArchived() && m.getReadAt() != null;
            case "archived" -> m.isArchived();
            case "sent" -> true;
            default -> !m.isArchived();
        };
    }

    @Transactional(readOnly = true)
    public long unreadCount(String username) {
        return repository.countByRecipientIdAndReadAtIsNullAndArchivedFalse(me(username).getId());
    }

    /** 쪽지 보내기. 받는 사람 수만큼 행을 만든다(각자 따로 확인·보관·삭제하기 때문). */
    @Transactional
    public List<ShortMessageResponse> send(SendShortMessageRequest req, String username) {
        User sender = me(username);
        BusinessPartner partner = req.partnerId() == null ? null : partnerService.get(req.partnerId());
        LocalDateTime now = LocalDateTime.now();

        return req.recipientIds().stream().distinct().map(rid -> {
            User recipient = userRepository.findById(rid)
                    .orElseThrow(() -> ApiException.notFound("받는 사람을 찾을 수 없습니다. id=" + rid));
            ShortMessage m = ShortMessage.builder()
                    .sender(sender)
                    .recipient(recipient)
                    .partner(partner)
                    .content(req.content())
                    .sentAt(now)
                    .build();
            return ShortMessageResponse.from(repository.save(m));
        }).toList();
    }

    /**
     * 시스템 자동알림 발송. 보낸 사람 없이 남기며, 받는 사람이 없으면 조용히 넘어간다
     * (알림 실패가 본 업무 트랜잭션을 롤백시키면 안 된다).
     */
    @Transactional
    public void notify(User recipient, String content, String linkSource, String linkRef, String linkPath) {
        if (recipient == null) {
            return;
        }
        repository.save(ShortMessage.builder()
                .recipient(recipient)
                .content(content)
                .sentAt(LocalDateTime.now())
                .linkSource(linkSource)
                .linkRef(linkRef)
                .linkPath(linkPath)
                .build());
    }

    /** 확인(읽음). 받는 사람 본인만. */
    @Transactional
    public ShortMessageResponse markRead(Long id, String username) {
        ShortMessage m = mine(id, username, true);
        if (m.getReadAt() == null) {
            m.setReadAt(LocalDateTime.now());
        }
        return ShortMessageResponse.from(m);
    }

    /** 보관함으로 옮기기 / 되돌리기. 받는 사람 본인만. */
    @Transactional
    public ShortMessageResponse archive(Long id, boolean archived, String username) {
        ShortMessage m = mine(id, username, true);
        m.setArchived(archived);
        return ShortMessageResponse.from(m);
    }

    /** 선택삭제. 내가 받았거나 보낸 쪽지만 지운다. */
    @Transactional
    public int delete(List<Long> ids, String username) {
        int deleted = 0;
        for (Long id : ids) {
            repository.delete(mine(id, username, false));
            deleted++;
        }
        return deleted;
    }

    /**
     * 내 쪽지인지 확인.
     *
     * @param recipientOnly true 면 받는 사람만(확인·보관), false 면 보낸/받은 어느 쪽이든(삭제)
     */
    private ShortMessage mine(Long id, String username, boolean recipientOnly) {
        ShortMessage m = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("쪽지를 찾을 수 없습니다. id=" + id));
        User user = me(username);
        boolean isRecipient = m.getRecipient().getId().equals(user.getId());
        boolean isSender = m.getSender() != null && m.getSender().getId().equals(user.getId());
        if (recipientOnly ? !isRecipient : !(isRecipient || isSender)) {
            throw ApiException.badRequest(recipientOnly
                    ? "받는 사람만 확인·보관할 수 있습니다."
                    : "본인이 주고받은 쪽지만 삭제할 수 있습니다.");
        }
        return m;
    }

    private User me(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없습니다: " + username));
    }
}

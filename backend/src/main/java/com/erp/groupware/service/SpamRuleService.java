package com.erp.groupware.service;

import com.erp.common.ApiException;
import com.erp.groupware.domain.Mail;
import com.erp.groupware.domain.SpamRule;
import com.erp.groupware.dto.SpamRuleDtos.SaveSpamRuleRequest;
import com.erp.groupware.dto.SpamRuleDtos.SpamRuleResponse;
import com.erp.groupware.repository.SpamRuleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;

/**
 * 스팸 규칙 관리와 판정. 공용메일이 들어올 때 {@link #firstMatch} 로 걸러낸다.
 *
 * 부분일치(대소문자 무시)만 지원한다. 정규식을 허용하면 잘못 쓴 패턴 하나로 멀쩡한 메일이
 * 조용히 스팸함으로 사라지는데, 그건 규칙을 못 쓰는 것보다 나쁘다.
 */
@Service
@RequiredArgsConstructor
public class SpamRuleService {

    private final SpamRuleRepository repository;

    @Transactional(readOnly = true)
    public List<SpamRuleResponse> findAll() {
        return repository.findAllByOrderByIdAsc().stream().map(SpamRuleResponse::from).toList();
    }

    @Transactional
    public SpamRuleResponse create(SaveSpamRuleRequest req) {
        return SpamRuleResponse.from(repository.save(SpamRule.builder()
                .kind(req.kind())
                .pattern(req.pattern().trim())
                .active(req.active() == null || req.active())
                .note(req.note())
                .build()));
    }

    @Transactional
    public SpamRuleResponse update(Long id, SaveSpamRuleRequest req) {
        SpamRule r = get(id);
        r.setKind(req.kind());
        r.setPattern(req.pattern().trim());
        if (req.active() != null) r.setActive(req.active());
        r.setNote(req.note());
        return SpamRuleResponse.from(r);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(get(id));
    }

    /**
     * 이 메일에 걸리는 첫 규칙의 설명. 걸리는 규칙이 없으면 null.
     * 반환값을 그대로 메일의 스팸 사유로 남겨, 나중에 "왜 스팸이 됐나"를 답할 수 있게 한다.
     */
    @Transactional(readOnly = true)
    public String firstMatch(Mail mail) {
        for (SpamRule r : repository.findByActiveTrue()) {
            String target = switch (r.getKind()) {
                case FROM_ADDRESS -> mail.getFromAddress();
                case SUBJECT -> mail.getSubject();
                case BODY -> mail.getBody();
            };
            if (target != null && target.toLowerCase(Locale.ROOT).contains(r.getPattern().toLowerCase(Locale.ROOT))) {
                return r.getKind().getDisplayName() + "에 '" + r.getPattern() + "' 포함";
            }
        }
        return null;
    }

    private SpamRule get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("스팸 규칙을 찾을 수 없습니다. id=" + id));
    }
}

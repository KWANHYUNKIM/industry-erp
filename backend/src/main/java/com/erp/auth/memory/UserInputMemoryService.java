package com.erp.auth.memory;

import com.erp.auth.user.UserRepository;
import com.erp.common.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserInputMemoryService {

    private final UserInputMemoryRepository repository;
    private final UserRepository userRepository;

    public UserInputMemoryService(UserInputMemoryRepository repository, UserRepository userRepository) {
        this.repository = repository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public String get(Long userId, String key) {
        return repository.findByUser_IdAndKey(userId, checkKey(key)).map(UserInputMemory::getValue).orElse(null);
    }

    @Transactional
    public void put(Long userId, String key, String value) {
        checkKey(key);
        UserInputMemory m = repository.findByUser_IdAndKey(userId, key).orElse(null);
        if (m == null) {
            m = UserInputMemory.builder()
                    .user(userRepository.getReferenceById(userId))
                    .key(key)
                    .value(value)
                    .build();
        } else {
            m.setValue(value);
        }
        repository.save(m);
    }

    private static String checkKey(String key) {
        if (key == null || key.isBlank() || key.length() > 100) {
            throw ApiException.badRequest("기억 키는 1~100자여야 합니다.");
        }
        return key;
    }
}

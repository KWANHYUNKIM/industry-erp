package com.erp.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

/**
 * BaseTimeEntity 의 @CreatedDate / @LastModifiedDate 자동 채움 활성화.
 */
@Configuration
@EnableJpaAuditing
public class JpaConfig {
}

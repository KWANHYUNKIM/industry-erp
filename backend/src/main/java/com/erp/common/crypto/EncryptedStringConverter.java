package com.erp.common.crypto;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * 문자열 칸을 DB 에 암호화해 적고 읽을 때 푼다({@link PiiCipher}). 엔티티 필드에 {@code @Convert(converter = EncryptedStringConverter.class)}.
 * 같은 평문도 매번 다른 값이 되므로(무작위 IV) 이 칸으로 검색 · 유일 제약은 못 한다.
 */
@Converter
public class EncryptedStringConverter implements AttributeConverter<String, String> {

    @Override
    public String convertToDatabaseColumn(String attribute) {
        return PiiCipher.encrypt(attribute);
    }

    @Override
    public String convertToEntityAttribute(String dbData) {
        return PiiCipher.decrypt(dbData);
    }
}

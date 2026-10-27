package com.erp.auth.memory.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class UserInputMemoryDtos {
    private UserInputMemoryDtos() {}

    public record MemoryResponse(String value) {}

    public record SaveMemoryRequest(@NotNull @Size(max = 4000) String value) {}
}

package dev.casino.save;

/** El cliente intentó escribir sobre una revisión que no es la última del servidor. */
public class SaveConflictException extends RuntimeException {

    private final SaveDtos.SaveResponse server;

    public SaveConflictException(SaveDtos.SaveResponse server) {
        super("El servidor tiene un guardado más reciente");
        this.server = server;
    }

    public SaveDtos.SaveResponse server() {
        return server;
    }
}

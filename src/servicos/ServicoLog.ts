export class ServicoLog {
    static log(message: string, context?: any) {
        console.log(`[INFO] ${new Date().toISOString()}: ${message}`, context || '');
    }

    static error(message: string, error?: any) {
        console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, error || '');
        // Aqui poderia ser integrada a chamada ao Sentry.io no futuro
    }

    static warn(message: string, context?: any) {
        console.warn(`[WARN] ${new Date().toISOString()}: ${message}`, context || '');
    }
}





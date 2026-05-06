import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponseBody {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const { message, error } = this.extractMessage(exception, status);

    if (status >= 500) {
      const detail =
        exception instanceof Error
          ? exception.stack
          : JSON.stringify(exception);
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        detail,
      );
    }

    const body: ErrorResponseBody = {
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(body);
  }

  private extractMessage(
    exception: unknown,
    status: number,
  ): { message: string | string[]; error: string } {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        return { message: res, error: this.defaultError(status) };
      }
      if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        return {
          message:
            (obj.message as string | string[] | undefined) ?? exception.message,
          error: (obj.error as string | undefined) ?? this.defaultError(status),
        };
      }
      return { message: exception.message, error: this.defaultError(status) };
    }

    return {
      message:
        exception instanceof Error
          ? exception.message
          : 'Internal server error',
      error: this.defaultError(status),
    };
  }

  private defaultError(status: number): string {
    return HttpStatus[status] ?? 'Error';
  }
}

export abstract class BaseError extends Error {
  public readonly timestamp: Date;
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly details?: any;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: string,
    statusCode?: number,
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    
    Object.setPrototypeOf(this, new.target.prototype);
    
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    this.timestamp = new Date();
    
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp.toISOString(),
      details: this.details,
      stack: this.stack
    };
  }
}

export class ValidationError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, true, details);
  }
}

export class NotFoundError extends BaseError {
  constructor(resource: string, identifier?: string) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    
    super(message, 'NOT_FOUND', 404, true, { resource, identifier });
  }
}

export class UnauthorizedError extends BaseError {
  constructor(message: string = 'Unauthorized access') {
    super(message, 'UNAUTHORIZED', 401, true);
  }
}

export class ForbiddenError extends BaseError {
  constructor(message: string = 'Access forbidden') {
    super(message, 'FORBIDDEN', 403, true);
  }
}

export class ConflictError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'CONFLICT', 409, true, details);
  }
}

export class RateLimitError extends BaseError {
  constructor(
    message: string = 'Rate limit exceeded',
    retryAfter?: number
  ) {
    super(message, 'RATE_LIMIT', 429, true, { retryAfter });
  }
}

export class ExternalServiceError extends BaseError {
  constructor(
    service: string,
    message: string,
    statusCode?: number,
    details?: any
  ) {
    super(
      `External service error (${service}): ${message}`,
      'EXTERNAL_SERVICE_ERROR',
      statusCode || 503,
      true,
      { service, ...details }
    );
  }
}

export class InternalError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'INTERNAL_ERROR', 500, false, details);
  }
}
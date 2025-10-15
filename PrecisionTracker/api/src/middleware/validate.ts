import type { NextFunction, Request, Response } from 'express';
import type { AnyZodObject, ZodError } from 'zod';
import { ZodIssueCode } from 'zod';

type SchemaMap = {
  body?: AnyZodObject;
  query?: AnyZodObject;
  params?: AnyZodObject;
};

const formatZodError = (error: ZodError) => {
  return error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path.join('.') || issue.path[0] || '',
    message:
      issue.code === ZodIssueCode.invalid_type && issue.expected
        ? `${issue.message} (expected ${issue.expected})`
        : issue.message
  }));
};

export const validate =
  (schemas: SchemaMap) => (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }

      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }

      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof Error && (error as ZodError).issues) {
        const issues = formatZodError(error as ZodError);
        res.status(400).json({
          message: 'Validation failed',
          errors: issues
        });
        return;
      }

      next(error);
    }
  };

export default validate;

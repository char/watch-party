import * as j from "@char/justin";
import { Context as OakContext, Status } from "@oak/oak";

export type APIResponseType = unknown & object;

export class APIError extends Error {
  constructor(
    public status: Status,
    message: string,
    public extra?: unknown & object,
  ) {
    super(message);
  }
}

interface TypedJsonHandlerOptions<
  QuerySchema extends j.AnySchema | undefined = undefined,
  BodySchema extends j.AnySchema | undefined = undefined,
> {
  query?: QuerySchema;
  body?: BodySchema;
}
interface TypedJsonHandlerInput<
  QuerySchema extends j.AnySchema | undefined = undefined,
  BodySchema extends j.AnySchema | undefined = undefined,
> {
  query: j.Infer<NonNullable<QuerySchema>>;
  body: j.Infer<NonNullable<BodySchema>>;
}
type TypedJsonHandlerCallback<
  Context,
  QuerySchema extends j.AnySchema | undefined = undefined,
  BodySchema extends j.AnySchema | undefined = undefined,
> = (
  ctx: Context,
  input: TypedJsonHandlerInput<QuerySchema, BodySchema>,
) => APIResponseType | Promise<APIResponseType>;

export function apiHandler<
  Context extends OakContext,
  QuerySchema extends j.AnySchema | undefined = undefined,
  BodySchema extends j.AnySchema | undefined = undefined,
>(
  opts: TypedJsonHandlerOptions<QuerySchema, BodySchema>,
  callback: TypedJsonHandlerCallback<Context, QuerySchema, BodySchema>,
): (ctx: Context) => Promise<void> {
  return async ctx => {
    try {
      const input: Partial<TypedJsonHandlerInput<QuerySchema, BodySchema>> = {};

      if (opts.query) {
        const query = ctx.request.url.searchParams.entries().pipe(Object.fromEntries);
        const validateQuery = j.compile(opts.query);

        const { value, errors } = validateQuery(query);
        if (errors) {
          throw new APIError(Status.BadRequest, `error parsing query parameters`, {
            issues: errors.map(it => `${it.path}: ${it.msg}`),
          });
        } else {
          input.query = value;
        }
      }

      if (opts.body) {
        const body = await ctx.request.body
          .text()
          .then(t => (t ? JSON.parse(t) : {}))
          .catch(() =>
            Promise.reject(new APIError(Status.BadRequest, "body was not JSON-encoded")),
          );

        const validateBody = j.compile(opts.body);
        const { value, errors } = validateBody(body);
        if (errors) {
          throw new APIError(Status.BadRequest, `error parsing request body: ${err.message}`, {
            issues: errors.map(it => `${it.path}: ${it.msg}`),
          });
        } else {
          input.body = value;
        }
      }

      const response = await callback(
        ctx,
        input as TypedJsonHandlerInput<QuerySchema, BodySchema>,
      );
      ctx.response.body = JSON.stringify(response);
      ctx.response.type = "application/json";
    } catch (err) {
      if (err instanceof APIError) {
        ctx.response.status = err.status;
        ctx.response.body = JSON.stringify({ ...err.extra, error: err.message });
        ctx.response.type = "application/json";
      } else throw err;
    }
  };
}

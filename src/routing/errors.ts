// Typed error so callers can `instanceof RoutingError` and present a
// recovery hint to the user.
export class RoutingError extends Error {
  readonly code = 'ROUTING_ERROR'
  constructor(message: string) {
    super(message)
    this.name = 'RoutingError'
  }
}

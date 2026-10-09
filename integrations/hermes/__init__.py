def register(ctx):
    from .adapter import register as register_platform
    register_platform(ctx)

from rest_framework import permissions


def user_broker(user):
    if not user or not user.is_authenticated:
        return None
    try:
        broker = user.crm_broker
    except AttributeError:
        return None
    return broker if broker.active else None


def can_view_all_crm(user):
    broker = user_broker(user)
    return bool(user and user.is_authenticated and (user.is_staff or (broker and broker.role == broker.Role.MANAGER)))


def crm_user_payload(user):
    broker = user_broker(user)
    if user.is_staff:
        role = "admin"
    elif broker:
        role = broker.role
    else:
        role = "none"
    return {
        "username": user.username,
        "role": role,
        "broker_id": str(broker.id) if broker else None,
        "broker_name": broker.name if broker else "",
        "can_view_all_crm": can_view_all_crm(user),
        "can_manage_site": user.is_staff,
        "can_manage_team": user.is_staff,
    }


class IsCRMUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (request.user.is_staff or user_broker(request.user)))


class IsCRMManager(permissions.BasePermission):
    def has_permission(self, request, view):
        return can_view_all_crm(request.user)

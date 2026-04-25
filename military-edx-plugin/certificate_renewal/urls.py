from django.urls import path
from . import views

app_name = "certificate_renewal"

urlpatterns = [
    path("renewal/", views.RenewalStatusView.as_view(), name="status"),
    path("renewal/<str:course_id>/exam/", views.RenewalExamView.as_view(), name="exam"),
    path("renewal/<str:course_id>/submit/", views.RenewalSubmitView.as_view(), name="submit"),
]

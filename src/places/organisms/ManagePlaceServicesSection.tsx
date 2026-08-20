"use client";

import { addPlaceService } from "@/actions/addPlaceService";
import { removePlaceService } from "@/actions/removePlaceService";
import { updatePlaceService } from "@/actions/updatePlaceService";
import Notification from "@/components/atoms/Notification";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { useTimedMessage } from "@/hooks/useTimedMessage";
import { useState } from "react";
import { IoAddOutline, IoPencilOutline, IoTrashOutline } from "react-icons/io5";

type PlaceService = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  price_unit: string | null;
  show_price: boolean;
};

type ServiceFormValues = {
  name: string;
  description: string;
  price: string;
  priceUnit: string;
  showPrice: boolean;
};

const EMPTY_FORM: ServiceFormValues = {
  name: "",
  description: "",
  price: "",
  priceUnit: "",
  showPrice: true,
};

type ManagePlaceServicesSectionProps = {
  placeId: string;
  services: PlaceService[];
  onChanged: () => void;
};

// CRUD list for a place's services -- add/edit share one small inline form
// (ServiceForm below), remove goes through the standard
// ConfirmDeleteModal.tsx confirmation.
export default function ManagePlaceServicesSection({
  placeId,
  services,
  onChanged,
}: ManagePlaceServicesSectionProps) {
  const { message: notification, showMessage } = useTimedMessage(3000);

  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [servicePendingRemoval, setServicePendingRemoval] = useState<
    string | null
  >(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleAdd = async (values: ServiceFormValues) => {
    setIsSubmitting(true);
    try {
      const response = await addPlaceService({
        placeId,
        name: values.name,
        description: values.description || undefined,
        price: values.price ? Number(values.price) : undefined,
        priceUnit: values.priceUnit || undefined,
        showPrice: values.showPrice,
      });

      if (response.status === 200) {
        showMessage("✅ Service added successfully!");
        setIsAdding(false);
        onChanged();
      } else {
        showMessage(`❌ ${response.message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (serviceId: string, values: ServiceFormValues) => {
    setIsSubmitting(true);
    try {
      const response = await updatePlaceService({
        serviceId,
        name: values.name,
        description: values.description || null,
        price: values.price ? Number(values.price) : null,
        priceUnit: values.priceUnit || null,
        showPrice: values.showPrice,
      });

      if (response.status === 200) {
        showMessage("✅ Service updated successfully!");
        setEditingServiceId(null);
        onChanged();
      } else {
        showMessage(`❌ ${response.message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmRemove = async () => {
    if (!servicePendingRemoval) return;
    setIsRemoving(true);
    try {
      const response = await removePlaceService(servicePendingRemoval);
      if (response.status === 200) {
        onChanged();
      } else {
        showMessage(`❌ ${response.message}`);
      }
    } finally {
      setIsRemoving(false);
      setServicePendingRemoval(null);
    }
  };

  return (
    <div className="space-y-4">
      {services.length === 0 && !isAdding && (
        <p className="text-muted-foreground text-sm">No services listed yet.</p>
      )}

      <ul className="space-y-3">
        {services.map((service) =>
          editingServiceId === service.id ? (
            <li
              key={service.id}
              className="border border-border rounded-lg p-3"
            >
              <ServiceForm
                initialValues={{
                  name: service.name,
                  description: service.description ?? "",
                  price: service.price != null ? String(service.price) : "",
                  priceUnit: service.price_unit ?? "",
                  showPrice: service.show_price,
                }}
                isSubmitting={isSubmitting}
                onCancel={() => setEditingServiceId(null)}
                onSubmit={(values) => handleUpdate(service.id, values)}
              />
            </li>
          ) : (
            <li
              key={service.id}
              className="flex items-start justify-between gap-3 border border-border rounded-lg p-3"
            >
              <div className="min-w-0">
                <h4 className="font-medium text-card-foreground">
                  {service.name}
                </h4>
                {service.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {service.description}
                  </p>
                )}
                {service.show_price && service.price != null && (
                  <p className="text-sm font-medium text-card-foreground mt-1">
                    {service.price}
                    {service.price_unit ? ` / ${service.price_unit}` : ""}
                  </p>
                )}
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingServiceId(service.id)}
                  className="p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Edit service"
                >
                  <IoPencilOutline />
                </button>
                <button
                  type="button"
                  onClick={() => setServicePendingRemoval(service.id)}
                  className="p-1 text-destructive hover:text-destructive/80"
                  aria-label="Remove service"
                >
                  <IoTrashOutline />
                </button>
              </div>
            </li>
          ),
        )}
      </ul>

      {isAdding ? (
        <div className="border border-border rounded-lg p-3">
          <ServiceForm
            initialValues={EMPTY_FORM}
            isSubmitting={isSubmitting}
            onCancel={() => setIsAdding(false)}
            onSubmit={handleAdd}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 border border-dashed border-border rounded-lg px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
        >
          <IoAddOutline className="text-lg" />
          Add a service
        </button>
      )}

      {servicePendingRemoval && (
        <ConfirmDeleteModal
          message="Remove this service? This can't be undone."
          isLoading={isRemoving}
          onConfirm={handleConfirmRemove}
          onCancel={() => setServicePendingRemoval(null)}
        />
      )}

      <Notification notification={notification} />
    </div>
  );
}

function ServiceForm({
  initialValues,
  isSubmitting,
  onCancel,
  onSubmit,
}: {
  initialValues: ServiceFormValues;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: ServiceFormValues) => void;
}) {
  const [values, setValues] = useState<ServiceFormValues>(initialValues);

  const patch = (changes: Partial<ServiceFormValues>) =>
    setValues((prev) => ({ ...prev, ...changes }));

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder="Service name"
        value={values.name}
        onChange={(e) => patch({ name: e.target.value })}
        className="w-full rounded-md border border-input bg-background p-2 text-sm"
      />
      <input
        type="text"
        placeholder="Description (optional)"
        value={values.description}
        onChange={(e) => patch({ description: e.target.value })}
        className="w-full rounded-md border border-input bg-background p-2 text-sm"
      />
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="Price (optional)"
          value={values.price}
          onChange={(e) => patch({ price: e.target.value })}
          className="w-1/2 rounded-md border border-input bg-background p-2 text-sm"
        />
        <input
          type="text"
          placeholder="Price unit (e.g. per hour)"
          value={values.priceUnit}
          onChange={(e) => patch({ priceUnit: e.target.value })}
          className="w-1/2 rounded-md border border-input bg-background p-2 text-sm"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={values.showPrice}
          onChange={(e) => patch({ showPrice: e.target.checked })}
          className="h-4 w-4 accent-primary"
        />
        Show price publicly
      </label>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={isSubmitting || !values.name}
          onClick={() => onSubmit(values)}
          className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {isSubmitting ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 border border-border py-2 rounded-md text-sm hover:bg-accent transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

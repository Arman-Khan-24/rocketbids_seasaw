"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Upload, X, ImageIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/shared/Toast";
import { useUser } from "@/lib/hooks/useUser";

interface FormErrors {
  title?: string;
  end_time?: string;
  start_time?: string;
  min_bid?: string;
  image?: string;
}

export default function CreateAuction() {
  const router = useRouter();
  const { user } = useUser();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "General",
    min_bid: "1",
    start_time: "",
    end_time: "",
    blind_mode: false,
  });

  function updateForm(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      setErrors((prev) => ({
        ...prev,
        image: "Only JPEG, PNG, WebP, and GIF images are allowed",
      }));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({
        ...prev,
        image: "Image must be under 5MB",
      }));
      return;
    }

    setImageFile(file);
    setErrors((prev) => ({ ...prev, image: undefined }));
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function removeImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function validate(): boolean {
    const newErrors: FormErrors = {};

    if (!form.title.trim()) {
      newErrors.title = "Title is required";
    }

    const minBid = parseInt(form.min_bid, 10);
    if (isNaN(minBid) || minBid <= 0) {
      newErrors.min_bid = "Minimum bid must be greater than 0";
    }

    if (!form.start_time) {
      newErrors.start_time = "Start time is required";
    }

    if (!form.end_time) {
      newErrors.end_time = "End time is required";
    }

    if (form.start_time && form.end_time) {
      const start = new Date(form.start_time);
      const end = new Date(form.end_time);
      if (end <= start) {
        newErrors.end_time = "End time must be after start time";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!validate()) return;

    setLoading(true);
    let imageUrl: string | null = null;

    // Upload image through server API so bucket creation and permissions are handled safely.
    if (imageFile) {
      const uploadForm = new FormData();
      uploadForm.append("file", imageFile);

      const uploadRes = await fetch("/api/uploads/auction-image", {
        method: "POST",
        body: uploadForm,
      });

      const uploadJson = (await uploadRes.json()) as {
        error?: string;
        publicUrl?: string;
      };

      if (!uploadRes.ok || !uploadJson.publicUrl) {
        addToast(uploadJson.error || "Image upload failed", "error");
        setLoading(false);
        return;
      }

      imageUrl = uploadJson.publicUrl;
    }

    const startTime = new Date(form.start_time);
    const now = new Date();
    const status = startTime > now ? "upcoming" : "active";

    const createRes = await fetch("/api/auctions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim(),
        image_url: imageUrl,
        category: form.category,
        min_bid: parseInt(form.min_bid, 10),
        start_time: startTime.toISOString(),
        end_time: new Date(form.end_time).toISOString(),
        blind_mode: form.blind_mode,
        status,
      }),
    });

    const createJson = (await createRes.json()) as {
      error?: string;
    };

    if (!createRes.ok) {
      addToast(createJson.error || "Failed to create auction", "error");
      setLoading(false);
    } else {
      addToast("Auction created successfully!", "success");
      router.push("/admin/auctions");
    }
  }

  const categories = [
    "General",
    "Electronics",
    "Art",
    "Collectibles",
    "Sports",
    "Fashion",
    "Books",
    "Other",
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/auctions"
          className="text-rocket-muted hover:text-rocket-text transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold text-rocket-text">
            Create Auction
          </h1>
          <p className="text-sm text-rocket-muted mt-1">
            Set up a new RocketBids auction
          </p>
        </div>
      </div>

      <motion.form
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSubmit}
        className="rounded-xl border border-rocket-border bg-rocket-card p-6 space-y-5"
      >
        {/* Title */}
        <Input
          label="Title"
          placeholder="Vintage Watch Collection"
          value={form.title}
          onChange={(e) => updateForm("title", e.target.value)}
          error={errors.title}
          required
        />

        {/* Description */}
        <div className="space-y-1.5">
          <label className="block text-sm text-rocket-muted">Description</label>
          <textarea
            placeholder="Describe the auction item..."
            value={form.description}
            onChange={(e) => updateForm("description", e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-rocket-border bg-rocket-bg px-4 py-2.5 text-rocket-text placeholder:text-rocket-dim focus:border-rocket-gold focus:outline-none focus:ring-1 focus:ring-rocket-gold/50 transition-colors resize-none"
          />
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <label className="block text-sm text-rocket-muted">Category</label>
          <select
            value={form.category}
            onChange={(e) => updateForm("category", e.target.value)}
            className="w-full rounded-lg border border-rocket-border bg-rocket-bg px-4 py-2.5 text-rocket-text focus:border-rocket-gold focus:outline-none focus:ring-1 focus:ring-rocket-gold/50 transition-colors"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Image Upload */}
        <div className="space-y-1.5">
          <label className="block text-sm text-rocket-muted">
            Image Upload
          </label>

          {imagePreview ? (
            <div className="relative rounded-lg border border-rocket-border overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="Preview"
                className="w-full h-48 object-cover"
              />
              <button
                type="button"
                onClick={removeImage}
                className="absolute top-2 right-2 rounded-full bg-rocket-bg/80 p-1.5 text-rocket-muted hover:text-rocket-text transition-colors"
              >
                <X size={16} />
              </button>
              <div className="absolute bottom-2 left-2 rounded-md bg-rocket-bg/80 px-2 py-1 text-xs text-rocket-muted">
                {imageFile?.name}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-lg border-2 border-dashed border-rocket-border bg-rocket-bg p-8 text-center hover:border-rocket-gold/50 transition-colors group"
            >
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-lg bg-rocket-card p-3 group-hover:bg-rocket-gold/10 transition-colors">
                  <ImageIcon
                    size={24}
                    className="text-rocket-dim group-hover:text-rocket-gold transition-colors"
                  />
                </div>
                <div>
                  <p className="text-sm text-rocket-text">
                    Click to upload an image
                  </p>
                  <p className="text-xs text-rocket-dim mt-0.5">
                    JPEG, PNG, WebP or GIF — Max 5MB
                  </p>
                </div>
              </div>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleImageSelect}
            className="hidden"
          />
          {errors.image && (
            <p className="text-sm text-rocket-danger">{errors.image}</p>
          )}
        </div>

        {/* Start Time + End Time */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Start Time"
            type="datetime-local"
            value={form.start_time}
            onChange={(e) => updateForm("start_time", e.target.value)}
            error={errors.start_time}
            required
          />
          <Input
            label="End Time"
            type="datetime-local"
            value={form.end_time}
            onChange={(e) => updateForm("end_time", e.target.value)}
            error={errors.end_time}
            required
          />
        </div>

        {/* Minimum Bid */}
        <Input
          label="Minimum Bid (credits)"
          type="number"
          min="1"
          value={form.min_bid}
          onChange={(e) => updateForm("min_bid", e.target.value)}
          error={errors.min_bid}
          required
          className="font-mono"
        />

        {/* Blind Mode */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              checked={form.blind_mode}
              onChange={(e) => updateForm("blind_mode", e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-10 h-5 bg-rocket-dim rounded-full peer-checked:bg-rocket-gold/80 transition-colors" />
            <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
          </div>
          <div>
            <span className="text-sm text-rocket-text group-hover:text-rocket-gold transition-colors">
              Blind Mode
            </span>
            <p className="text-xs text-rocket-muted">
              Hide bid amounts from other bidders until auction closes
            </p>
          </div>
        </label>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Link href="/admin/auctions">
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Upload size={16} className="mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus size={16} className="mr-2" />
                Create Auction
              </>
            )}
          </Button>
        </div>
      </motion.form>
    </div>
  );
}

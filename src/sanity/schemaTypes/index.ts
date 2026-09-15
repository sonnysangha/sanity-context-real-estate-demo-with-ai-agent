import { defineArrayMember, defineField, defineType } from "sanity";
import { HomeIcon, MapPinIcon } from "lucide-react";
const requiredString = (name: string, title: string) =>
  defineField({ name, title, type: "string", validation: (r) => r.required() });
const neighbourhood = defineType({
  name: "neighbourhood",
  title: "Neighbourhood",
  type: "document",
  icon: MapPinIcon,
  fields: [
    requiredString("name", "Name"),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "name" },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "borough",
      type: "string",
      options: {
        list: ["Brooklyn", "Queens", "Manhattan", "Bronx", "Staten Island"],
      },
      validation: (r) => r.required(),
    }),
  ],
});
const listing = defineType({
  name: "listing",
  title: "Apartment",
  type: "document",
  icon: HomeIcon,
  groups: [
    { name: "home", title: "The apartment", default: true },
    { name: "details", title: "Features" },
    { name: "availability", title: "Availability" },
    { name: "media", title: "Photography" },
  ],
  fields: [
    { ...requiredString("title", "Listing name"), group: "home" },
    defineField({
      name: "slug",
      type: "slug",
      group: "home",
      options: { source: "title" },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "city",
      type: "string",
      group: "home",
      initialValue: "new-york-city",
      readOnly: true,
      validation: (r) => r.required(),
    }),
    defineField({
      name: "neighbourhood",
      type: "reference",
      group: "home",
      to: [{ type: "neighbourhood" }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: "monthlyRent",
      title: "Monthly base rent (USD)",
      type: "number",
      group: "home",
      validation: (r) => r.required().positive().integer(),
    }),
    defineField({
      name: "currency",
      type: "string",
      group: "home",
      initialValue: "USD",
      readOnly: true,
    }),
    defineField({
      name: "description",
      type: "text",
      rows: 5,
      group: "home",
      description:
        "Describe the physical apartment. This text powers semantic preferences.",
      validation: (r) => r.required().min(30),
    }),
    ...["bedrooms", "bathrooms", "squareFeet"].map((name) =>
      defineField({
        name,
        type: "number",
        group: "details",
        validation: (r) => r.required().min(0),
      }),
    ),
    ...["furnished", "petsAllowed", "inUnitLaundry"].map((name) =>
      defineField({
        name,
        type: "boolean",
        group: "details",
        initialValue: false,
        validation: (r) => r.required(),
      }),
    ),
    defineField({
      name: "features",
      type: "array",
      group: "details",
      of: [defineArrayMember({ type: "string" })],
    }),
    defineField({
      name: "status",
      type: "string",
      group: "availability",
      options: {
        list: [
          { title: "Available", value: "available" },
          { title: "Rented", value: "rented" },
        ],
        layout: "radio",
      },
      initialValue: "available",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "availableFrom",
      description:
        "Date-only YYYY-MM-DD string. In GROQ compare directly with a quoted date string, not dateTime().",
      title: "Earliest move-in date",
      type: "date",
      group: "availability",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "public",
      title: "Visible to apartment seekers",
      type: "boolean",
      group: "availability",
      initialValue: true,
      description: "The Context endpoint also enforces this field.",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "images",
      type: "array",
      group: "media",
      of: [
        defineArrayMember({
          type: "image",
          options: { hotspot: true },
          fields: [
            defineField({
              name: "alt",
              type: "string",
              validation: (r) => r.required(),
            }),
          ],
        }),
      ],
      validation: (r) => r.required().min(1),
    }),
    defineField({ name: "seedVersion", type: "string", hidden: true }),
  ],
  preview: {
    select: {
      title: "title",
      rent: "monthlyRent",
      status: "status",
      media: "images.0",
    },
    prepare({ title, rent, status, media }) {
      return {
        title,
        subtitle: `$${rent?.toLocaleString("en-US")}/mo · ${status}`,
        media,
      };
    },
  },
});
export const schemaTypes = [neighbourhood, listing];

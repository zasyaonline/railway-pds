#!/usr/bin/osascript
-- Create a UTM VM named railway-vm (Virtualize / Apple backend, QEMU hypervisor fallback).
-- Arguments: vmName, ubuntuIsoPath, cidataIsoPath, cpuCores, memoryMiB, diskMiB, architecture
on run argv
  if (count of argv) < 6 then error "usage: name iso cidata cpu memory disk [arch]"
  set vmName to item 1 of argv
  set isoPath to item 2 of argv
  set cidataPath to item 3 of argv
  set cpuCount to item 4 of argv as integer
  set memoryMib to item 5 of argv as integer
  set diskMib to item 6 of argv as integer
  set archName to "aarch64"
  if (count of argv) > 6 then set archName to item 7 of argv

  set ubuntuIso to POSIX file isoPath
  set cidataIso to POSIX file cidataPath

  tell application "UTM"
    set existing to {}
    try
      set existing to name of virtual machines
    end try
    if existing contains vmName then
      return "exists:" & vmName
    end if

    try
      -- QEMU + hypervisor is still Virtualize (HVF), and attaches installer ISOs
      -- more reliably than the sandboxed Apple backend on this Mac.
      make new virtual machine with properties {backend:qemu, configuration:{name:vmName, architecture:archName, hypervisor:true, cpu cores:cpuCount, memory:memoryMib, displays:{{hardware:"virtio-ramfb"}}, drives:{{removable:true, source:ubuntuIso}, {removable:true, source:cidataIso}, {guest size:diskMib}}}}
      return "created-qemu:" & vmName
    on error qemuErr
      make new virtual machine with properties {backend:apple, configuration:{name:vmName, cpu cores:cpuCount, memory:memoryMib, drives:{{removable:true, source:ubuntuIso}, {removable:true, source:cidataIso}, {guest size:diskMib}}, network interfaces:{{mode:shared}}}}
      return "created-apple:" & vmName & " qemu-error:" & qemuErr
    end try
  end tell
end run
